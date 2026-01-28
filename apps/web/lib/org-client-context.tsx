'use client';

import React, { createContext, useContext } from 'react';

export interface OrgContextValue {
	organizationId: string | null;
	organizationSlug: string | null;
	organizationName: string | null;
	organizationRole?: 'admin' | 'owner' | 'member' | null;
	userRole?: string;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

export function OrgProvider({
	value,
	children,
}: {
	value: OrgContextValue;
	children: React.ReactNode;
}): React.ReactElement {
	return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrgContext(): OrgContextValue {
	const ctx = useContext(OrgContext);
	if (!ctx) {
		throw new Error('useOrgContext must be used within an OrgProvider');
	}
	return ctx;
}
