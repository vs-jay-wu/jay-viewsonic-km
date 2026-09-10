import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { repoPath } from "@/lib/repo";

export const dynamic = "force-dynamic";

// 「檢視腳本內容」用：memclean 的本體與 zsh 薄殼。
const FILES = [
  { path: "shell/memclean.py", language: "python", note: "本體（web 與終端機共用）" },
  { path: "shell/memclean.zsh", language: "shell", note: "~/.zshrc source 的薄殼" },
];

export async function GET() {
  const files = await Promise.all(
    FILES.map(async (f) => ({
      ...f,
      content: await readFile(repoPath(f.path), "utf8").catch(
        (e: Error) => `（讀不到 ${f.path}：${e.message}）`
      ),
    }))
  );
  return NextResponse.json({ files });
}
