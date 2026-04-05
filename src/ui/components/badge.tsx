"use client";

import type React from "react";
import { cn } from "../lib/utils";
import { getDuration } from "../lib/animation-config";
import { motion } from "framer-motion";

export type BadgeVariant =
	| "default"
	| "secondary"
	| "outline"
	| "destructive"
	| "success"
	| "warning"
	| "info"
	| "published"
	| "draft"
	| "archived"
	| "new"
	| "read"
	| "responded"
	| "glass";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
	variant?: BadgeVariant;
	children: React.ReactNode;
}

export function Badge({
	variant = "default",
	className,
	children,
	...props
}: BadgeProps) {
	const variants: Record<BadgeVariant, string> = {
		default: "border-transparent bg-secondary text-secondary-foreground",
		secondary: "border-transparent bg-muted text-muted-foreground",
		outline: "border-border bg-transparent text-muted-foreground",
		glass: "border-transparent bg-muted text-muted-foreground",
		destructive: "border-transparent bg-red-500/15 text-red-400",
		success: "border-transparent bg-emerald-500/15 text-emerald-400",
		published: "border-transparent bg-emerald-500/15 text-emerald-400",
		warning: "border-transparent bg-amber-500/15 text-amber-300",
		draft: "border-transparent bg-amber-500/15 text-amber-300",
		read: "border-transparent bg-amber-500/15 text-amber-300",
		info: "border-transparent bg-sky-500/15 text-sky-300",
		new: "border-transparent bg-sky-500/15 text-sky-300",
		responded: "border-transparent bg-emerald-500/15 text-emerald-400",
		archived: "border-transparent bg-muted text-muted-foreground",
	};

	return (
		<motion.span
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: getDuration("normal") }}
			{...(props as any)}
			className={cn(
				"inline-flex items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.02em] focus:outline-none focus:ring-1 focus:ring-ring/50",
				variants[variant],
				className,
			)}
		>
			{children}
		</motion.span>
	);
}
