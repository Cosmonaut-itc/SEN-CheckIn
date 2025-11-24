"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Label variants using class-variance-authority.
 */
const labelVariants = cva(
	"text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

/**
 * Label component for form inputs.
 * Built on Radix UI Label primitive for accessibility.
 *
 * @param props - Label component props
 * @returns Rendered label element
 */
const Label = React.forwardRef<
	React.ComponentRef<typeof LabelPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
		VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
	<LabelPrimitive.Root
		ref={ref}
		className={cn(labelVariants(), className)}
		{...props}
	/>
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
