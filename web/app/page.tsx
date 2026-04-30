import { redirect } from "next/navigation";
import { listChats } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Home() {
  const chats = listChats();
  if (chats.length > 0) redirect(`/chat/${chats[0].id}`);
  return (
    <div className="flex items-center justify-center h-full text-gray-400">
      尚無聊天室資料
    </div>
  );
}
