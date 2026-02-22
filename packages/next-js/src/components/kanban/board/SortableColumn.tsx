"use client";

import { useEffect, useRef, useState } from "react";
import {
	useSortable,
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDndContext } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
	AlertCircle,
	Loader2,
	Mic,
	MicOff,
	Plus,
	Sparkles,
	X,
} from "lucide-react";
import type { KanbanTask, Tag } from "@/types/kanban";
import { cn } from "@/lib/utils";
import { SortableTask } from "./SortableTask";

type SpeechRecognitionResultLike = {
	isFinal: boolean;
	0: {
		transcript: string;
	};
};

type SpeechRecognitionResultListLike = {
	length: number;
	[index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = Event & {
	resultIndex: number;
	results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = Event & {
	error?: string;
};

type BrowserSpeechRecognition = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	onresult: ((event: SpeechRecognitionEventLike) => void) | null;
	onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
	onend: (() => void) | null;
	start: () => void;
	stop: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

export interface SortableColumnProps {
	id: string;
	name: string;
	color: string;
	tasks: KanbanTask[];
	globalTags: Tag[];
	onDeleteTask: (id: string) => void;
	onTaskClick?: (task: KanbanTask) => void;
}

export function SortableColumn({
	id,
	name,
	color,
	tasks,
	globalTags,
	onDeleteTask,
	onTaskClick,
}: SortableColumnProps) {
	const { active, over } = useDndContext();
	const isDraggingAnyTask = active?.data.current?.type === "task";

	// Determine if a task is being dragged over this specific column
	const isTaskOverThisColumn =
		isDraggingAnyTask &&
		(over?.id === id ||
			over?.data.current?.task?.columnId === id ||
			(over?.data.current?.type === "column" && over.id === id));

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
		isOver: isColumnOver,
	} = useSortable({
		id: id,
		data: {
			type: "column",
		},
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const [isHovered, setIsHovered] = useState(false);
	const isEmpty = tasks.length === 0;
	const isOver = isColumnOver || isTaskOverThisColumn;
	const isMinimized = isEmpty;

	const getColumnWidth = () => {
		if (!isMinimized) return "w-80";
		if (isOver || isHovered) return "w-80";
		if (isDraggingAnyTask) return "w-32";
		return "w-14";
	};

	return (
		<div
			ref={setNodeRef}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			style={{
				...style,
				borderColor: color 
					? (isHovered || isOver ? color : `${color}40`) 
					: undefined,
				boxShadow: color 
					? (isHovered || isOver 
						? `0 0 30px -5px ${color}40, inset 0 0 10px ${color}10` 
						: `0 0 25px -10px ${color}20`)
					: undefined,
				backgroundColor: color
					? (isHovered || isOver 
						? `color-mix(in srgb, ${color} 6%, #0B0E14)` 
						: `color-mix(in srgb, ${color} 3%, #0B0E14)`)
					: "#0B0E14",
			}}
			className={cn(
				"flex-shrink-0 rounded-2xl border flex flex-col h-full relative group/column overflow-hidden",
				"transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
				getColumnWidth(),
				!color && (isHovered || isOver ? "border-slate-600" : "border-slate-800/50"),
				isDragging && "opacity-50 scale-95",
				isOver && "ring-4 ring-blue-500/20 scale-[1.02] z-10",
			)}
		>
			<div
				{...attributes}
				{...listeners}
				className="p-4 border-b border-slate-800/50 cursor-grab active:cursor-grabbing select-none shrink-0"
				title={isMinimized && !isOver && !isHovered ? name : undefined}
			>
				<div className="flex items-center justify-between relative min-h-[32px]">
					<div
						className={cn(
							"flex items-center gap-2 flex-1 min-w-0 transition-all duration-500 ease-in-out",
							isMinimized &&
								!isOver &&
								!isHovered &&
								!isDraggingAnyTask &&
								"opacity-0 translate-x-4 pointer-events-none group-hover/column:opacity-100 group-hover/column:translate-x-0 group-hover/column:pointer-events-auto",
						)}
					>
						<span className="text-sm font-bold text-slate-200 truncate px-1">
							{name}
						</span>
						<span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-full shrink-0">
							{tasks.length}
						</span>
					</div>

					{isMinimized && !isOver && !isHovered && !isDraggingAnyTask && (
						<div className="absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-500 ease-in-out group-hover/column:opacity-0 group-hover/column:scale-150">
							<span className="text-lg font-black text-slate-500/50 uppercase tracking-tighter">
								{name.charAt(0)}
							</span>
						</div>
					)}
				</div>
			</div>

			<div
				className={cn(
					"flex-1 overflow-y-auto custom-scrollbar p-3 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
					isMinimized && !isOver && !isHovered
						? "opacity-0 translate-y-8 pointer-events-none"
						: "opacity-100 translate-y-0",
				)}
			>
				<SortableContext
					items={tasks.map((t) => t.id)}
					strategy={verticalListSortingStrategy}
				>
					{tasks.length === 0 ? (
						<div className="text-center py-12 text-slate-600">
							<div className="w-10 h-10 bg-slate-800/50 rounded-xl flex items-center justify-center mx-auto mb-3">
								<AlertCircle className="w-5 h-5" />
							</div>
							<p className="text-sm">No tasks yet</p>
						</div>
					) : (
						tasks.map((task) => (
							<SortableTask
								key={task.id}
								task={task}
								globalTags={globalTags}
								onDelete={onDeleteTask}
								onClick={onTaskClick}
							/>
						))
					)}
				</SortableContext>
			</div>
		</div>
	);
}
