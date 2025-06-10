import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const owner =
      url.searchParams.get("owner") || process.env.GITHUB_OWNER || "openai";
    const repo =
      url.searchParams.get("repo") || process.env.GITHUB_REPO || "openai-node";
    const page = Number(url.searchParams.get("page") || "1");
    const per_page = Number(url.searchParams.get("per_page") || "10");

    // 1) List closed PRs
    const { data: pulls } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "closed",
      per_page,
      page,
    });

    // 2) For each merged PR, list its files and concatenate patches
    const diffs = await Promise.all(
      pulls
        .filter((pr) => pr.merged_at)
        .map(async (pr) => {
          const { data: files } = await octokit.rest.pulls.listFiles({
            owner,
            repo,
            pull_number: pr.number,
            per_page: 300,
          });
          const diffText = files
            .map((f) => f.patch)
            .filter(Boolean)
            .join("\n");
          return {
            id: pr.number.toString(),
            description: pr.title,
            diff: diffText,
            url: pr.html_url,
          };
        })
    );

    return NextResponse.json({
      diffs,
      nextPage: diffs.length < per_page ? null : page + 1,
      currentPage: page,
      perPage: per_page,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Could not fetch PR diffs", details: msg },
      { status: 500 }
    );
  }
}
