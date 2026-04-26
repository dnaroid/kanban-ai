"use client";

import { useParams } from "next/navigation";
import { BoardScreen } from "@/components/BoardScreen";

export default function BoardPage() {
	const params = useParams();
	const projectId = params.projectId as string;

	return <BoardScreen projectId={projectId} />;
}
