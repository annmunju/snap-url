import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { upsertDocument } from "./db.js";
import type { ExtractedData, ExtractedLink } from "./types.js";

const State = Annotation.Root({
  rawUrl: Annotation<string>,
  url: Annotation<string>,
  jinaUrl: Annotation<string>,
  markdown: Annotation<string>,
  extracted: Annotation<ExtractedData>,
  summary: Annotation<string>,
  storedId: Annotation<number>,
});

const llm = process.env.OPENAI_API_KEY
  ? new ChatOpenAI({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.2,
    })
  : null;

const JINA_FETCH_TIMEOUT_MS = Number(process.env.JINA_FETCH_TIMEOUT_MS ?? 20000);

function normalizeUrl(rawUrl: string): string {
  const noBackslashes = rawUrl.trim().replace(/\\+/g, "").replace(/%5C/gi, "");
  return new URL(noBackslashes).toString();
}

function toJinaUrl(url: string): string {
  const withoutProtocol = url.replace(/^https?:\/\//i, "");
  return `https://r.jina.ai/http://${withoutProtocol}`;
}

function extractLinksFromMarkdown(markdown: string, baseUrl: string): ExtractedLink[] {
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const seen = new Set<string>();
  const links: ExtractedLink[] = [];

  for (const match of markdown.matchAll(linkRegex)) {
    const content = (match[1] ?? "").trim();
    const url = (match[2] ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    links.push({ url, content });
  }

  if (!seen.has(baseUrl)) {
    links.unshift({ url: baseUrl, content: "original source" });
  }

  return links.slice(0, 100);
}

function firstNonEmptyLine(text: string): string {
  const line = text
    .split("\n")
    .map((v) => v.trim())
    .find((v) => Boolean(v));
  return line ?? "(제목 없음)";
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__|\*|_/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function normalizeNode(state: typeof State.State) {
  const url = normalizeUrl(state.rawUrl);
  return {
    url,
    jinaUrl: toJinaUrl(url),
  };
}

async function fetchJinaNode(state: typeof State.State) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JINA_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(state.jinaUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "snap-url-bot/0.1",
      },
    });

    if (!response.ok) {
      throw new Error(`Jina fetch failed: ${response.status} ${response.statusText}`);
    }

    const markdown = await response.text();
    if (!markdown || markdown.trim().length < 30) {
      throw new Error("Jina fetch returned empty markdown");
    }

    return { markdown };
  } finally {
    clearTimeout(timeout);
  }
}

async function extractNode(state: typeof State.State) {
  const markdown = state.markdown.trim();
  const title = firstNonEmptyLine(markdown).replace(/^#\s*/, "").slice(0, 180);
  const plain = stripMarkdown(markdown);

  const extracted: ExtractedData = {
    title,
    description: `jina markdown mirror from ${state.url}`,
    content: plain.slice(0, 30000),
    contentHtmls: [],
    links: extractLinksFromMarkdown(markdown, state.url),
  };

  return { extracted };
}

function fallbackSummary(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) return "요약할 본문이 비어 있습니다.";
  if (collapsed.length <= 500) return collapsed;
  return `${collapsed.slice(0, 500)}...`;
}

async function summarizeNode(state: typeof State.State) {
  const { title, description, content } = state.extracted;

  if (!llm) {
    return {
      summary: fallbackSummary(`${title}\n${description}\n${content}`),
    };
  }

  const trimmed = content.slice(0, 12000);
  const prompt = [
    "다음 문서를 한국어로 간결하게 요약해줘.",
    "출력 형식:",
    "1) 한 줄 핵심",
    "2) 주요 포인트 3개",
    "3) 원문 읽기 전에 알아야 할 맥락 1개",
    "문서 제목:",
    title || "(제목 없음)",
    "문서 설명:",
    description || "(설명 없음)",
    "문서 본문:",
    trimmed || "(본문 없음)",
  ].join("\n");

  const result = await llm.invoke(prompt);
  return {
    summary: result.content.toString().trim(),
  };
}

async function persistNode(state: typeof State.State) {
  const row = upsertDocument({
    url: state.url,
    title: state.extracted.title,
    description: state.extracted.description,
    content: state.extracted.content,
    summary: state.summary,
    links: state.extracted.links,
  });

  return { storedId: row.id };
}

const graph = new StateGraph(State)
  .addNode("normalize", normalizeNode)
  .addNode("fetchJina", fetchJinaNode)
  .addNode("extract", extractNode)
  .addNode("summarize", summarizeNode)
  .addNode("persist", persistNode)
  .addEdge(START, "normalize")
  .addEdge("normalize", "fetchJina")
  .addEdge("fetchJina", "extract")
  .addEdge("extract", "summarize")
  .addEdge("summarize", "persist")
  .addEdge("persist", END)
  .compile();

export async function ingestUrl(rawUrl: string) {
  const output = await graph.invoke({
    rawUrl,
    url: rawUrl,
    jinaUrl: "",
    markdown: "",
  });

  return {
    id: output.storedId,
    url: output.url,
    jinaUrl: output.jinaUrl,
    fetchMode: "jina-markdown",
    extracted: output.extracted,
    summary: output.summary,
  };
}
