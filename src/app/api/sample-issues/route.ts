// src/app/api/sample-issues/route.ts
import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const prNumber = searchParams.get("pr");
  if (!prNumber) {
    return NextResponse.json({ error: "Missing pr param" }, { status: 400 });
  }
  try {
    // List issues that mention this PR in their body/title (example tool call)
    const { data: issues } = await octokit.search.issuesAndPullRequests({
      q: `repo:openai/openai-node "${prNumber}" in:body,is:issue`,
    });
    const titles = issues.items.map((i) => `- ${i.title}`).join("\n");
    return NextResponse.json({
      summary:
        titles.length > 0
          ? `Related issues:\n${titles}`
          : "No related issues found.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
