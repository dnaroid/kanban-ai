/* eslint-disable react-refresh/only-export-components */
import type { Metadata } from "next";
import "./globals.css";
import { ClientLayout } from "@/components/ClientLayout";

export const metadata: Metadata = {
	title: "KanbanAI",
	description: "Next.js App Router migration of Kanban AI application",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" className="dark">
			<body className="antialiased overflow-x-hidden">
				<ClientLayout>{children}</ClientLayout>
			</body>
		</html>
	);
}
