"use client";

import { useEffect, useState } from "react";
import { Loader2, ClipboardCheck, Copy } from "lucide-react";

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
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <Loader2 className="animate-spin h-12 w-12 text-blue-600 mb-4" />
        <span className="text-lg text-gray-600">Loading releases…</span>
      </div>
    );
  }
  if (errorDiffs) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-lg">{errorDiffs}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header Section - Centered */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold text-gray-900 mb-8">Diff Digest</h1>

          {/* Dropdown - Centered */}
          <div className="flex justify-center">
            <select
              className="px-6 py-3 border-2 border-gray-300 rounded-lg text-lg bg-white shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none min-w-96"
              value={selected?.id || ""}
              onChange={(e) =>
                setSelected(diffs.find((d) => d.id === e.target.value) || null)
              }
            >
              <option value="">Select Release</option>
              {diffs.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  #{pr.id} - {pr.description}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Notes Section - Two Columns */}
        {selected && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">
            {/* Developer Notes Column */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-gray-800">
                  Developer Notes
                </h2>
                {loadingNotes && (
                  <div className="flex items-center gap-2 text-blue-600">
                    <Loader2 className="animate-spin h-5 w-5" />
                    <span className="text-sm">Generating...</span>
                  </div>
                )}
              </div>

              <textarea
                className="w-full h-80 p-4 border border-gray-300 rounded-lg resize-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none font-mono text-sm"
                value={devNotes}
                readOnly
                placeholder={
                  loadingNotes
                    ? "Generating developer notes..."
                    : "Developer notes will appear here"
                }
              />

              <button
                onClick={() => copyToClipboard(devNotes, "developer")}
                disabled={!devNotes || loadingNotes}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {copied === "developer" ? (
                  <>
                    <ClipboardCheck className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy to Clipboard
                  </>
                )}
              </button>
            </div>

            {/* Marketing Notes Column */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-gray-800">
                  Marketing Notes
                </h2>
                {loadingNotes && (
                  <div className="flex items-center gap-2 text-blue-600">
                    <Loader2 className="animate-spin h-5 w-5" />
                    <span className="text-sm">Generating...</span>
                  </div>
                )}
              </div>

              <textarea
                className="w-full h-80 p-4 border border-gray-300 rounded-lg resize-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none font-mono text-sm"
                value={mktNotes}
                readOnly
                placeholder={
                  loadingNotes
                    ? "Generating marketing notes..."
                    : "Marketing notes will appear here"
                }
              />

              <button
                onClick={() => copyToClipboard(mktNotes, "marketing")}
                disabled={!mktNotes || loadingNotes}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {copied === "marketing" ? (
                  <>
                    <ClipboardCheck className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy to Clipboard
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!selected && !loadingDiffs && (
          <div className="text-center mt-16">
            <div className="text-gray-400 text-lg">
              Select a release above to generate notes
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
