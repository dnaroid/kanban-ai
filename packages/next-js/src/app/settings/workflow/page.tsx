"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WorkflowSettingsRootPage() {
	const router = useRouter();

	useEffect(() => {
		router.replace("/settings/workflow/events");
	}, [router]);

	return null;
}
