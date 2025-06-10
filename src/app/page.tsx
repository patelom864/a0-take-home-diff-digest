"use client";

import { useEffect, useState } from "react";
import { Loader2, ClipboardCheck } from "lucide-react";

interface Diff {
  id: string;
  description: string;
  diff: string;
  url: string;
}

export default function Home() {
  // --- diff list state ---
  const [diffs, setDiffs] = useState<Diff[]>([]);
  const [loadingDiffs, setLoadingDiffs] = useState(true);
  const [errorDiffs, setErrorDiffs] = useState<string | null>(null);

  // --- selection & notes state ---
  const [selected, setSelected] = useState<Diff | null>(null);
  const [devNotes, setDevNotes] = useState("");
  const [mktNotes, setMktNotes] = useState("");
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [copied, setCopied] = useState<"developer" | "marketing" | null>(null);

  // Load persisted notes when you select a PR
  useEffect(() => {
    if (!selected) return;
    const savedDev = localStorage.getItem(`dev-${selected.id}`) || "";
    const savedMkt = localStorage.getItem(`mkt-${selected.id}`) || "";
    setDevNotes(savedDev);
    setMktNotes(savedMkt);
  }, [selected]);

  // Persist notes whenever they change
  useEffect(() => {
    if (selected) localStorage.setItem(`dev-${selected.id}`, devNotes);
  }, [devNotes, selected]);
  useEffect(() => {
    if (selected) localStorage.setItem(`mkt-${selected.id}`, mktNotes);
  }, [mktNotes, selected]);

  // Fetch PR diffs
  useEffect(() => {
    fetch("/api/sample-diffs")
      .then((r) => r.json())
      .then((d) => setDiffs(d.diffs || []))
      .catch(() => setErrorDiffs("Failed to load releases"))
      .finally(() => setLoadingDiffs(false));
  }, []);

  // Stream notes + enrichment
  useEffect(() => {
    if (!selected) return;
    setLoadingNotes(true);
    setDevNotes("");
    setMktNotes("");

    const run = async () => {
      // 1. Stream from OpenAI
      const res = await fetch("/api/generate-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diff: selected.diff }),
      });
      if (!res.ok || !res.body) {
        setMktNotes(`Error: ${res.statusText}`);
        setLoadingNotes(false);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "",
        devDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        if (!devDone) {
          const a = buf.indexOf("<developer>");
          const b = buf.indexOf("</developer>");
          if (a > -1 && b > -1) {
            const devText = buf.slice(a + 11, b).trim();
            setDevNotes(devText);

            // 2. Tool call: fetch related issues and append
            const issuesRes = await fetch(
              `/api/sample-issues?pr=${selected.id}`
            );
            const issuesJson = await issuesRes.json();
            if (issuesJson.summary) {
              setDevNotes((prev) => prev + "\n\n" + issuesJson.summary);
            }

            devDone = true;
          }
        } else {
          const a = buf.indexOf("<marketing>");
          const b = buf.indexOf("</marketing>");
          if (a > -1 && b > -1) {
            setMktNotes(buf.slice(a + 11, b).trim());
            setLoadingNotes(false);
            break;
          }
        }
      }
    };

    run().catch((e) => {
      console.error(e);
      setMktNotes(`Error: ${e.message}`);
      setLoadingNotes(false);
    });
  }, [selected]);

  const copyToClipboard = (text: string, whom: "developer" | "marketing") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(whom);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  // — Loading / Error / Select UI —
  if (loadingDiffs) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <Loader2 className="animate-spin h-8 w-8 mb-2" />
        <span>Loading releases…</span>
      </div>
    );
  }
  if (errorDiffs) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-red-600">{errorDiffs}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 flex flex-col items-center space-y-8">
      <h1 className="text-5xl font-extrabold">Diff Digest</h1>

      <div className="w-full flex justify-center">
        <select
          className="border px-4 py-2 rounded w-64"
          value={selected?.id || ""}
          onChange={(e) =>
            setSelected(diffs.find((d) => d.id === e.target.value) || null)
          }
        >
          <option value="">Select release</option>
          {diffs.map((pr) => (
            <option key={pr.id} value={pr.id}>
              #{pr.id} {pr.description}
            </option>
          ))}
        </select>
      </div>

      {/* Notes */}
      {selected && (
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Developer */}
          <div className="flex flex-col">
            <h2 className="text-2xl font-semibold mb-2">Developer Notes</h2>
            {loadingNotes && (
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="animate-spin h-5 w-5" />
                <span>Streaming…</span>
              </div>
            )}
            <textarea
              className="flex-1 p-2 border rounded resize-none h-48"
              value={devNotes}
              readOnly
            />
            <button
              onClick={() => copyToClipboard(devNotes, "developer")}
              className="mt-2 self-center md:self-start flex items-center gap-1 text-blue-600"
            >
              <ClipboardCheck className="h-5 w-5" />
              {copied === "developer" ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* Marketing */}
          <div className="flex flex-col">
            <h2 className="text-2xl font-semibold mb-2">Marketing Notes</h2>
            {loadingNotes && (
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="animate-spin h-5 w-5" />
                <span>Streaming…</span>
              </div>
            )}
            <textarea
              className="flex-1 p-2 border rounded resize-none h-48"
              value={mktNotes}
              readOnly
            />
            <button
              onClick={() => copyToClipboard(mktNotes, "marketing")}
              className="mt-2 self-center md:self-start flex items-center gap-1 text-blue-600"
            >
              <ClipboardCheck className="h-5 w-5" />
              {copied === "marketing" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
