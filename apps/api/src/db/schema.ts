import { relations } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';

// ============================================================================
// Auth Tables (Managed by BetterAuth)
// ============================================================================

/**
 * User table - stores user account information.
 * Extended with admin plugin fields for role management and banning.
 */
export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').default(false).notNull(),
	image: text('image'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
	/** User role for admin plugin (e.g., 'user', 'admin') */
	role: text('role').default('user'),
	/** Whether the user is banned from the system */
	banned: boolean('banned').default(false),
	/** Reason for banning the user */
	banReason: text('ban_reason'),
	/** When the ban expires (null = permanent) */
	banExpires: timestamp('ban_expires'),
});

/**
 * Session table - stores user session information.
 * Extended with admin and organization plugin fields.
 */
export const session = pgTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: timestamp('expires_at').notNull(),
		token: text('token').notNull().unique(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** Admin user ID if this session is impersonating another user */
		impersonatedBy: text('impersonated_by'),
		/** Currently active organization ID for organization plugin */
		activeOrganizationId: text('active_organization_id'),
	},
	(table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at'),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
		scope: text('scope'),
		password: text('password'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index('account_userId_idx').on(table.userId)],
);

export const verification = pgTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const apikey = pgTable('apikey', {
	id: text('id').primaryKey(),
	name: text('name'),
	start: text('start'),
	prefix: text('prefix'),
	key: text('key').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	refillInterval: integer('refill_interval'),
	refillAmount: integer('refill_amount'),
	lastRefillAt: timestamp('last_refill_at'),
	enabled: boolean('enabled').default(true),
	rateLimitEnabled: boolean('rate_limit_enabled').default(true),
	rateLimitTimeWindow: integer('rate_limit_time_window').default(86400000),
	rateLimitMax: integer('rate_limit_max').default(10),
	requestCount: integer('request_count').default(0),
	remaining: integer('remaining'),
	lastRequest: timestamp('last_request'),
	expiresAt: timestamp('expires_at'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	permissions: text('permissions'),
	metadata: text('metadata'),
});

// ============================================================================
// Organization Tables (Managed by BetterAuth Organization Plugin)
// ============================================================================

/**
 * Organization table - stores organization/tenant information.
 * Used by the better-auth organization plugin for multi-tenant support.
 */
export const organization = pgTable('organization', {
	id: text('id').primaryKey(),
	/** Organization display name */
	name: text('name').notNull(),
	/** URL-friendly unique identifier */
	slug: text('slug').notNull().unique(),
	/** Organization logo URL */
	logo: text('logo'),
	/** Additional metadata as JSON */
	metadata: text('metadata'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Member table - stores organization membership.
 * Links users to organizations with roles.
 */
export const member = pgTable('member', {
	id: text('id').primaryKey(),
	/** Reference to the organization */
	organizationId: text('organization_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	/** Reference to the user */
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	/** Member role within the organization (e.g., 'owner', 'admin', 'member') */
	role: text('role').default('member').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Invitation table - stores pending organization invitations.
 * Allows inviting users to join organizations.
 */
export const invitation = pgTable('invitation', {
	id: text('id').primaryKey(),
	/** Reference to the organization */
	organizationId: text('organization_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' }),
	/** Email address of the invited user */
	email: text('email').notNull(),
	/** Role to assign when invitation is accepted */
	role: text('role'),
	/** Current status: pending, accepted, rejected, canceled */
	status: text('status').default('pending').notNull(),
	/** When the invitation expires */
	expiresAt: timestamp('expires_at').notNull(),
	/** Reference to the user who sent the invitation */
	inviterId: text('inviter_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
});

// ============================================================================
// Relations
// ============================================================================

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	apikeys: many(apikey),
	members: many(member),
	invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const apikeyRelations = relations(apikey, ({ one }) => ({
	user: one(user, {
		fields: [apikey.userId],
		references: [user.id],
	}),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(member),
	invitations: many(invitation),
}));

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id],
	}),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [invitation.inviterId],
		references: [user.id],
	}),
}));

// ============================================================================
// Enums
// ============================================================================

/**
 * Enum for attendance record types
 */
export const attendanceType = pgEnum('attendance_type', ['CHECK_IN', 'CHECK_OUT']);

/**
 * Enum for employee status
 */
export const employeeStatus = pgEnum('employee_status', ['ACTIVE', 'INACTIVE', 'ON_LEAVE']);

/**
 * Enum for device status
 */
export const deviceStatus = pgEnum('device_status', ['ONLINE', 'OFFLINE', 'MAINTENANCE']);

// ============================================================================
// Domain Tables
// ============================================================================

/**
 * Client table - stores client/company information
 */
export const client = pgTable('client', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	apiKeyId: text('api_key_id').references(() => apikey.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

/**
 * Location table - stores location/branch information
 */
export const location = pgTable('location', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	code: text('code').notNull().unique(),
	address: text('address'),
	clientId: text('client_id')
		.notNull()
		.references(() => client.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

/**
 * JobPosition table - stores job positions/roles for employees
 */
export const jobPosition = pgTable('job_position', {
	id: text('id').primaryKey(),
	/** Position name (e.g., "Software Engineer", "Manager") */
	name: text('name').notNull(),
	/** Optional description of the position */
	description: text('description'),
	/** Client this position belongs to (positions are client-specific) */
	clientId: text('client_id')
		.notNull()
		.references(() => client.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

/**
 * Employee table - stores employee information
 */
export const employee = pgTable('employee', {
	id: text('id').primaryKey(),
	/** Unique employee code/badge number */
	code: text('code').notNull().unique(),
	firstName: text('first_name').notNull(),
	lastName: text('last_name').notNull(),
	email: text('email'),
	/** Contact phone number */
	phone: text('phone'),
	/** Reference to employee's job position */
	jobPositionId: text('job_position_id').references(() => jobPosition.id, {
		onDelete: 'set null',
	}),
	/** Department name */
	department: text('department'),
	/** Employee status (ACTIVE, INACTIVE, ON_LEAVE) */
	status: employeeStatus('status').default('ACTIVE').notNull(),
	/** Date when employee was hired */
	hireDate: timestamp('hire_date'),
	/** Location where employee works */
	locationId: text('location_id').references(() => location.id, { onDelete: 'set null' }),
	/**
	 * Rekognition user ID for face recognition.
	 * Links the employee to their User Vector in the AWS Rekognition collection.
	 */
	rekognitionUserId: text('rekognition_user_id'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

/**
 * Device table - stores kiosk/device information
 */
export const device = pgTable('device', {
	id: text('id').primaryKey(),
	/** Unique device code */
	code: text('code').notNull().unique(),
	/** Device name/label */
	name: text('name'),
	/** Type of device (TABLET, KIOSK, MOBILE) */
	deviceType: text('device_type'),
	/** Device status (ONLINE, OFFLINE, MAINTENANCE) */
	status: deviceStatus('status').default('OFFLINE').notNull(),
	/** Last time device sent a heartbeat */
	lastHeartbeat: timestamp('last_heartbeat'),
	/** Location where device is installed */
	locationId: text('location_id').references(() => location.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

/**
 * AttendanceRecord table - stores attendance check-in/check-out records
 */
export const attendanceRecord = pgTable('attendance_record', {
	id: text('id').primaryKey(),
	employeeId: text('employee_id')
		.notNull()
		.references(() => employee.id, { onDelete: 'cascade' }),
	deviceId: text('device_id')
		.notNull()
		.references(() => device.id, { onDelete: 'cascade' }),
	timestamp: timestamp('timestamp').notNull(),
	type: attendanceType('type').notNull(),
	/**
	 * Additional metadata for Rekognition integration
	 * Stores match score, raw payload, face recognition data, etc.
	 */
	metadata: jsonb('metadata'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});
