import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  const { diff } = await req.json();
  const max = 2000;
  const d = diff.length > max ? diff.slice(0, max) + "\n...[truncated]" : diff;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You are a release‐notes generator.  
1) Produce a concise **Developer Note** summarizing what and why the change:  
<developer>YOUR DEVELOPER NOTE HERE</developer>  
2) Then produce a user‐friendly **Marketing Note**:  
<marketing>YOUR MARKETING NOTE HERE</marketing>
—
Here is the Git diff:
${d}
        `.trim(),
      },
    ],
    stream: true,
  });

  // Stream only the assistant’s delta.content
  const out = new ReadableStream({
    async start(ctrl) {
      for await (const chunk of completion) {
        const txt = chunk.choices[0].delta.content;
        if (txt) ctrl.enqueue(new TextEncoder().encode(txt));
      }
      ctrl.close();
    },
  });

  return new Response(out, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
