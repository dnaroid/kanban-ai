"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { JSONSchema } from "@/lib/json-schema-types";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ModelPicker } from "@/components/common/ModelPicker";
import type { OpencodeModel } from "@/types/kanban";

interface FieldProps {
	schema: JSONSchema;
	value: unknown;
	onChange: (value: unknown) => void;
	label?: string;
	path: string;
	models?: OpencodeModel[];
	modelVariants?: string[];
	depth?: number;
}

function DynamicInputField({
	label,
	value,
	onChange,
	type = "text",
	placeholder,
	disabled,
}: {
	label: string;
	value: string | number | undefined;
	onChange: (val: string) => void;
	type?: string;
	placeholder?: string;
	disabled?: boolean;
}) {
	return (
		<div className="relative">
			<div className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">
				{label}
			</div>
			<input
				type={type}
				value={value ?? ""}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				disabled={disabled}
				className={cn(
					"w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2.5",
					"text-sm text-slate-200 placeholder:text-slate-500",
					"focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50",
					"disabled:opacity-50 disabled:cursor-not-allowed",
				)}
			/>
		</div>
	);
}

function DynamicSelectField({
	label,
	value,
	onChange,
	options,
	placeholder,
}: {
	label: string;
	value: string | undefined;
	onChange: (val: string) => void;
	options: string[];
	placeholder?: string;
}) {
	return (
		<div className="relative">
			<div className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">
				{label}
			</div>
			<div className="relative">
				<select
					value={value ?? ""}
					onChange={(e) => onChange(e.target.value || "")}
					className={cn(
						"w-full appearance-none bg-slate-900/50 border border-slate-700/50",
						"rounded-lg px-3 py-2.5 pr-10 text-sm text-slate-200",
						"focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50",
						value === undefined && "text-slate-500",
					)}
				>
					<option value="">{placeholder ?? "Select..."}</option>
					{options.map((opt) => (
						<option key={opt} value={opt}>
							{opt}
						</option>
					))}
				</select>
				<ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-500 pointer-events-none" />
			</div>
		</div>
	);
}

function DynamicToggleField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: boolean | undefined;
	onChange: (val: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between py-2">
			<div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
				{label}
			</div>
			<button
				type="button"
				onClick={() => onChange(!value)}
				className={cn(
					"relative w-10 h-5 rounded-full transition-colors",
					value ? "bg-blue-500" : "bg-slate-600",
				)}
			>
				<div
					className={cn(
						"absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform",
						value && "translate-x-5",
					)}
				/>
			</button>
		</div>
	);
}

function DynamicArrayField({
	label,
	value,
	onChange,
	items,
}: {
	label: string;
	value: string[] | undefined;
	onChange: (val: string[]) => void;
	items?: JSONSchema;
}) {
	const arr = Array.isArray(value) ? value : [];

	const handleAdd = () => {
		onChange([...arr, ""]);
	};

	const handleRemove = (index: number) => {
		onChange(arr.filter((_, i) => i !== index));
	};

	const handleChange = (index: number, newValue: string) => {
		const updated = [...arr];
		updated[index] = newValue;
		onChange(updated);
	};

	return (
		<div>
			<div className="flex items-center justify-between mb-2">
				<div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
					{label}
				</div>
				<button
					type="button"
					onClick={handleAdd}
					className="text-xs text-blue-400 hover:text-blue-300"
				>
					+ Add
				</button>
			</div>
			<div className="space-y-2">
				{arr.map((item, index) => (
					<div key={`${item}-${index}`} className="flex gap-2">
						{items?.enum ? (
							<select
								value={item}
								onChange={(e) => handleChange(index, e.target.value)}
								className="flex-1 appearance-none bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200"
							>
								<option value="">Select...</option>
								{items.enum.map((opt) => (
									<option key={String(opt)} value={String(opt)}>
										{String(opt)}
									</option>
								))}
							</select>
						) : (
							<input
								type="text"
								value={item}
								onChange={(e) => handleChange(index, e.target.value)}
								className="flex-1 bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200"
							/>
						)}
						<button
							type="button"
							onClick={() => handleRemove(index)}
							className="text-red-400 hover:text-red-300 px-2"
						>
							×
						</button>
					</div>
				))}
			</div>
		</div>
	);
}

function DynamicObjectField({
	schema,
	value,
	onChange,
	path,
	models,
	modelVariants,
	depth = 0,
}: FieldProps & { depth?: number }) {
	const obj = (value as Record<string, unknown>) ?? {};

	const handleChange = (key: string, newValue: unknown) => {
		onChange({ ...obj, [key]: newValue });
	};

	// Handle defined properties
	const definedProps = schema.properties
		? Object.entries(schema.properties)
		: [];

	// Handle additionalProperties for dynamic keys (like agents.build, categories.primary)
	const additionalSchema = schema.additionalProperties as
		| JSONSchema
		| undefined;
	const dynamicKeys = additionalSchema
		? Object.keys(obj).filter((k) => !definedProps.some(([pk]) => pk === k))
		: [];

	if (definedProps.length === 0 && dynamicKeys.length === 0) return null;

	// For dynamic objects (agents, categories), render as collapsible tree
	if (depth > 0 && (definedProps.length > 0 || dynamicKeys.length > 0)) {
		return (
			<ObjectTreeNode
				schema={schema}
				value={obj}
				onChange={onChange}
				path={path}
				models={models}
				modelVariants={modelVariants}
				depth={depth}
				definedProps={definedProps}
				dynamicKeys={dynamicKeys}
				additionalSchema={additionalSchema}
			/>
		);
	}

	// Root level: render defined properties and dynamic keys
	return (
		<div className="space-y-2">
			{definedProps.map(([key, propSchema]) => (
				<DynamicField
					key={key}
					schema={propSchema as JSONSchema}
					value={obj[key]}
					onChange={(v) => handleChange(key, v)}
					label={key}
					path={`${path}.${key}`}
					models={models}
					modelVariants={modelVariants}
					depth={depth + 1}
				/>
			))}
			{dynamicKeys.map((key) => (
				<DynamicField
					key={key}
					schema={additionalSchema!}
					value={obj[key]}
					onChange={(v) => handleChange(key, v)}
					label={key}
					path={`${path}.${key}`}
					models={models}
					modelVariants={modelVariants}
					depth={depth + 1}
				/>
			))}
		</div>
	);
}

function ObjectTreeNode({
	schema,
	value,
	onChange,
	path,
	models,
	modelVariants,
	depth,
	definedProps,
	dynamicKeys,
	additionalSchema,
}: FieldProps & {
	depth: number;
	definedProps: [string, unknown][];
	dynamicKeys: string[];
	additionalSchema?: JSONSchema;
}) {
	const [isExpanded, setIsExpanded] = useState(false);
	const obj = (value as Record<string, unknown>) ?? {};

	const handleChange = (key: string, newValue: unknown) => {
		onChange({ ...obj, [key]: newValue });
	};

	const hasContent = definedProps.length > 0 || dynamicKeys.length > 0;

	// Calculate label from path
	const label = path.split(".").pop() ?? "";
	const fieldLabel = schema.title ?? label;

	return (
		<div className="border border-slate-700/30 rounded-lg overflow-hidden">
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full flex items-center gap-2 px-3 py-2 bg-slate-800/30 hover:bg-slate-700/30 transition-colors"
			>
				{isExpanded ? (
					<ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
				) : (
					<ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
				)}
				<span className="text-xs font-semibold text-slate-300 uppercase tracking-wider truncate">
					{fieldLabel}
				</span>
				{!hasContent && (
					<span className="text-[10px] text-slate-500 ml-auto">empty</span>
				)}
			</button>
			{isExpanded && hasContent && (
				<div className="p-3 space-y-3 bg-slate-900/20">
					{definedProps.map(([key, propSchema]) => (
						<DynamicField
							key={key}
							schema={propSchema as JSONSchema}
							value={obj[key]}
							onChange={(v) => handleChange(key, v)}
							label={key}
							path={`${path}.${key}`}
							models={models}
							modelVariants={modelVariants}
							depth={depth + 1}
						/>
					))}
					{dynamicKeys.map((key) => (
						<DynamicField
							key={key}
							schema={additionalSchema!}
							value={obj[key]}
							onChange={(v) => handleChange(key, v)}
							label={key}
							path={`${path}.${key}`}
							models={models}
							modelVariants={modelVariants}
							depth={depth + 1}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function DynamicField({
	schema,
	value,
	onChange,
	label,
	path,
	models,
	modelVariants,
	depth = 0,
}: FieldProps) {
	if (!schema) return null;

	const fieldLabel = schema.title ?? label ?? path.split(".").pop() ?? "";

	if (schema.type === "boolean") {
		return (
			<DynamicToggleField
				label={fieldLabel}
				value={value as boolean | undefined}
				onChange={(v) => onChange(v)}
			/>
		);
	}

	if (schema.enum && Array.isArray(schema.enum)) {
		return (
			<DynamicSelectField
				label={fieldLabel}
				value={value as string | undefined}
				onChange={(v) => onChange(v || undefined)}
				options={schema.enum.map(String)}
				placeholder={schema.description}
			/>
		);
	}

	if (schema.type === "string") {
		if (path.endsWith(".model") && models) {
			return (
				<div>
					<div className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">
						{fieldLabel}
					</div>
					<ModelPicker
						value={typeof value === "string" ? value : null}
						models={models}
						onChange={(val) => onChange(val ?? undefined)}
						placeholder={schema.description ?? "Select model"}
						allowAuto={false}
						showVariantSelector={false}
					/>
				</div>
			);
		}

		if (schema.format === "multiline" || path.includes("prompt")) {
			return (
				<div>
					<div className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">
						{fieldLabel}
					</div>
					<textarea
						value={(value as string) ?? ""}
						onChange={(e) => onChange(e.target.value || undefined)}
						placeholder={schema.description}
						rows={4}
						className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50"
					/>
				</div>
			);
		}

		if (schema.format === "color" || path.endsWith(".color")) {
			return (
				<div>
					<div className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 pl-1">
						{fieldLabel}
					</div>
					<div className="flex gap-2">
						<input
							type="color"
							value={(value as string) ?? "#000000"}
							onChange={(e) => onChange(e.target.value)}
							className="w-10 h-10 rounded border border-slate-700/50 bg-transparent cursor-pointer"
						/>
						<input
							type="text"
							value={(value as string) ?? ""}
							onChange={(e) => onChange(e.target.value || undefined)}
							placeholder={schema.description ?? "#RRGGBB"}
							className="flex-1 bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm text-slate-200"
						/>
					</div>
				</div>
			);
		}

		return (
			<DynamicInputField
				label={fieldLabel}
				value={value as string | undefined}
				onChange={(v) => onChange(v || undefined)}
				placeholder={schema.description}
			/>
		);
	}

	if (schema.type === "number" || schema.type === "integer") {
		return (
			<DynamicInputField
				label={fieldLabel}
				type="number"
				value={value as number | undefined}
				onChange={(v) => {
					const parsed = Number.parseFloat(v);
					onChange(Number.isNaN(parsed) ? undefined : parsed);
				}}
				placeholder={
					schema.description ??
					(schema.minimum !== undefined && schema.maximum !== undefined
						? `${schema.minimum} - ${schema.maximum}`
						: undefined)
				}
			/>
		);
	}

	if (schema.type === "array") {
		return (
			<DynamicArrayField
				label={fieldLabel}
				value={value as string[] | undefined}
				onChange={(v) => onChange(v.length > 0 ? v : undefined)}
				items={schema.items as JSONSchema | undefined}
			/>
		);
	}

	if (schema.type === "object") {
		return (
			<DynamicObjectField
				schema={schema}
				value={value}
				onChange={onChange}
				path={path}
				models={models}
				modelVariants={modelVariants}
				depth={depth + 1}
				label={depth === 0 ? fieldLabel : undefined}
			/>
		);
	}

	if (schema.oneOf || schema.anyOf) {
		return (
			<div className="text-xs text-slate-500 italic">
				{fieldLabel}: Complex type (oneOf/anyOf) - not yet supported
			</div>
		);
	}

	return null;
}

interface DynamicFormFieldsProps {
	schema: JSONSchema | null;
	data: Record<string, unknown>;
	onChange: (key: string, value: unknown) => void;
	models?: OpencodeModel[];
	modelVariants?: string[];
	excludeFields?: Set<string>;
}

function CollapsibleSection({
	title,
	defaultExpanded = false,
	children,
	className,
}: {
	title: string;
	defaultExpanded?: boolean;
	children: React.ReactNode;
	className?: string;
}) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);

	return (
		<div
			className={cn(
				"border border-slate-700/50 rounded-lg overflow-hidden",
				className,
			)}
		>
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full flex items-center gap-2 px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
			>
				{isExpanded ? (
					<ChevronDown className="w-4 h-4 text-slate-400" />
				) : (
					<ChevronRight className="w-4 h-4 text-slate-400" />
				)}
				<span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
					{title}
				</span>
			</button>
			{isExpanded && <div className="p-4">{children}</div>}
		</div>
	);
}

export function DynamicFormFields({
	schema,
	data,
	onChange,
	models,
	modelVariants,
	excludeFields = new Set(),
}: DynamicFormFieldsProps) {
	if (!schema?.properties) {
		return (
			<div className="text-sm text-slate-500 italic p-4">
				No schema available - form fields are static
			</div>
		);
	}

	// Separate simple fields from object/array fields (sections)
	const entries = Object.entries(schema.properties).filter(
		([key]) => !excludeFields.has(key),
	);

	const simpleFields = entries.filter(([, propSchema]) => {
		const ps = propSchema as JSONSchema;
		return ps.type !== "object" && ps.type !== "array";
	});

	const sectionFields = entries.filter(([, propSchema]) => {
		const ps = propSchema as JSONSchema;
		return ps.type === "object" || ps.type === "array";
	});

	return (
		<div className="space-y-4">
			{/* Simple fields section */}
			{simpleFields.length > 0 && (
				<CollapsibleSection title="General Settings">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						{simpleFields
							.sort(([, a], [, b]) => {
								const order = ["string", "number", "integer", "boolean"];
								const getTypeStr = (
									t: string | string[] | undefined,
								): string => (Array.isArray(t) ? t[0] : (t ?? "string"));
								const aIdx = order.indexOf(getTypeStr((a as JSONSchema).type));
								const bIdx = order.indexOf(getTypeStr((b as JSONSchema).type));
								return aIdx - bIdx;
							})
							.map(([key, propSchema]) => {
								const ps = propSchema as JSONSchema;
								return (
									<DynamicField
										key={key}
										schema={ps}
										value={data[key]}
										onChange={(v) => onChange(key, v)}
										label={ps.title ?? key}
										path={key}
										models={models}
										modelVariants={modelVariants}
									/>
								);
							})}
					</div>
				</CollapsibleSection>
			)}

			{sectionFields.map(([key, propSchema]) => {
				const ps = propSchema as JSONSchema;
				const sectionTitle = ps.title ?? key;

				return (
					<DynamicField
						key={key}
						schema={ps}
						value={data[key]}
						onChange={(v) => onChange(key, v)}
						label={sectionTitle}
						path={key}
						models={models}
						modelVariants={modelVariants}
						depth={1}
					/>
				);
			})}
		</div>
	);
}
