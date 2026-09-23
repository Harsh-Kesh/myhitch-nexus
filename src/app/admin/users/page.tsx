"use client";

import { IconCheck, IconCopy, IconUserOff, IconUserPlus, IconUsers } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  useAdminUsers,
  useCreateAdminUser,
  useUpdateUserRole,
  useUpdateUserStatus,
} from "@/lib/mock-api/hooks";
import type { AdminUserRow, User, UserRole } from "@/lib/mock-api/types";
import { formatDate, relativeTime } from "@/lib/utils";

const ALL_ROLES: UserRole[] = [
  "viewer",
  "creator",
  "business",
  "enterprise",
  "advertiser",
  "producer",
  "education",
  "organisation",
  "moderator",
  "finance-admin",
  "super-admin",
];

const STATUS_TONE: Record<User["status"], "published" | "pending" | "danger" | "archived"> = {
  active: "published",
  pending: "pending",
  suspended: "danger",
  closed: "archived",
};

export default function AdminUsersPage() {
  const { data: users = [], isLoading } = useAdminUsers();
  const updateRole = useUpdateUserRole();
  const updateStatus = useUpdateUserStatus();
  const createUser = useCreateAdminUser();
  const { toast } = useToast();

  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [roleFilter, setRoleFilter] = React.useState("all");
  const [editing, setEditing] = React.useState<AdminUserRow | null>(null);
  const [draftRoles, setDraftRoles] = React.useState<UserRole[]>([]);
  const [draftStatus, setDraftStatus] = React.useState<User["status"]>("active");
  const [reason, setReason] = React.useState("");

  const [addOpen, setAddOpen] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newRoles, setNewRoles] = React.useState<UserRole[]>([]);
  const [createdUser, setCreatedUser] = React.useState<{ email: string; tempPassword: string } | null>(
    null,
  );
  const [copied, setCopied] = React.useState(false);

  const resetAddForm = () => {
    setNewEmail("");
    setNewName("");
    setNewRoles([]);
  };

  const filtered = users.filter((user) => {
    if (statusFilter !== "all" && user.status !== statusFilter) return false;
    if (roleFilter !== "all" && !user.roles.includes(roleFilter as UserRole)) return false;
    if (
      query &&
      !`${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const columns: Array<Column<AdminUserRow>> = [
    {
      key: "name",
      header: "User",
      sortValue: (row) => row.name,
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.name} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-fg">{row.name}</span>
            <span className="block truncate text-2xs text-fg-subtle">{row.email}</span>
          </span>
        </div>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      secondary: true,
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.roles.slice(0, 3).map((role) => (
            <Badge key={role} tone="outline" size="sm">
              {role}
            </Badge>
          ))}
          {row.roles.length > 3 ? (
            <Badge tone="neutral" size="sm">
              +{row.roles.length - 3}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS_TONE[row.status]} size="sm">
            {row.status}
          </Badge>
          {row.mustChangePassword ? (
            <Badge tone="pending" size="sm">
              Setup pending
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "country",
      header: "Country",
      secondary: true,
      sortValue: (row) => row.country,
      cell: (row) => row.country,
    },
    {
      key: "created",
      header: "Joined",
      secondary: true,
      sortValue: (row) => row.createdAt,
      cell: (row) => <span className="nx-tnum">{formatDate(row.createdAt)}</span>,
    },
    {
      key: "active",
      header: "Last active",
      secondary: true,
      sortValue: (row) => row.lastActiveAt,
      cell: (row) => (
        <span className="text-fg-subtle">{relativeTime(row.lastActiveAt)}</span>
      ),
    },
    {
      key: "flags",
      header: "Flags",
      align: "right",
      sortValue: (row) => row.flags,
      cell: (row) =>
        row.flags > 0 ? (
          <Badge tone="danger" size="sm">
            {row.flags}
          </Badge>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            setEditing(row);
            setDraftRoles(row.roles);
            setDraftStatus(row.status);
            setReason("");
          }}
        >
          Manage
        </Button>
      ),
    },
  ];

  const counts = {
    active: users.filter((u) => u.status === "active").length,
    pending: users.filter((u) => u.status === "pending").length,
    suspended: users.filter((u) => u.status === "suspended").length,
    flagged: users.filter((u) => u.flags > 0).length,
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Search accounts, assign roles and change account status. Every change is recorded in the audit log."
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <IconUserPlus />
            New user
          </Button>
        }
      />

      <PageBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Active" value={String(counts.active)} icon={<IconUsers />} />
          <Stat label="Pending" value={String(counts.pending)} />
          <Stat
            label="Suspended"
            value={String(counts.suspended)}
            icon={<IconUserOff />}
          />
          <Stat label="Flagged" value={String(counts.flagged)} invertDelta />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or email"
            className="max-w-xs"
            sizeVariant="sm"
          />
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            sizeVariant="sm"
            className="w-40"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
            <option value="closed">Closed</option>
          </Select>
          <Select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            sizeVariant="sm"
            className="w-40"
            aria-label="Filter by role"
          >
            <option value="all">All roles</option>
            {ALL_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </Select>
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(row) => row.id}
            pageSize={12}
            caption="Platform users"
          />
        )}
      </PageBody>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.name}
        description={editing?.email}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={
                (draftStatus !== editing?.status ||
                  draftRoles.join() !== editing?.roles.join()) &&
                reason.trim().length < 8
              }
              onClick={() => {
                if (!editing) return;
                if (draftRoles.join() !== editing.roles.join()) {
                  updateRole.mutate({ userId: editing.id, roles: draftRoles, reason: reason.trim() });
                }
                if (draftStatus !== editing.status) {
                  updateStatus.mutate({
                    userId: editing.id,
                    status: draftStatus,
                    reason: reason.trim(),
                  });
                }
                toast({
                  title: "User updated",
                  description: "Changes are recorded in the audit log.",
                });
                setEditing(null);
              }}
            >
              Save changes
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
              <Avatar name={editing.name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{editing.name}</p>
                <p className="text-2xs text-fg-subtle nx-tnum">
                  Joined {formatDate(editing.createdAt)} · last active{" "}
                  {relativeTime(editing.lastActiveAt)}
                </p>
              </div>
              {editing.flags > 0 ? (
                <Badge tone="danger" size="sm">
                  {editing.flags} flags
                </Badge>
              ) : null}
            </div>

            <Field label="Roles" hint="Roles determine which workspaces this account can open.">
              <div className="flex flex-wrap gap-1.5">
                {ALL_ROLES.map((role) => {
                  const active = draftRoles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setDraftRoles((current) =>
                          current.includes(role)
                            ? current.filter((r) => r !== role)
                            : [...current, role],
                        )
                      }
                      className={
                        active
                          ? "rounded-full border border-accent bg-accent/10 px-3 py-1 text-xs font-medium text-accent-hover"
                          : "rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-fg-muted hover:border-border-strong"
                      }
                    >
                      {role}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Account status" htmlFor="user-status">
              <Select
                id="user-status"
                value={draftStatus}
                onChange={(event) =>
                  setDraftStatus(event.target.value as User["status"])
                }
              >
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
                <option value="closed">Closed</option>
              </Select>
            </Field>

            {draftStatus !== editing.status || draftRoles.join() !== editing.roles.join() ? (
              <Field
                label="Reason for this change"
                htmlFor="user-reason"
                required
                hint="Recorded in the audit log and shown to the account holder."
              >
                <Textarea
                  id="user-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                />
              </Field>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* New user */}
      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          resetAddForm();
        }}
        title="New user"
        description="Creates the account directly with a temporary password — no self-registration needed."
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setAddOpen(false);
                resetAddForm();
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!newEmail.trim() || !newName.trim() || newRoles.length === 0}
              loading={createUser.isPending}
              onClick={async () => {
                try {
                  const result = await createUser.mutateAsync({
                    email: newEmail.trim(),
                    fullName: newName.trim(),
                    roles: newRoles,
                  });
                  if (result.outcome === "email_taken") {
                    toast({
                      title: "That email is already registered",
                      tone: "error",
                    });
                    return;
                  }
                  setAddOpen(false);
                  setCreatedUser({ email: newEmail.trim(), tempPassword: result.tempPassword });
                  resetAddForm();
                } catch (err) {
                  toast({
                    title: "Couldn't create the user",
                    description: err instanceof Error ? err.message : undefined,
                    tone: "error",
                  });
                }
              }}
            >
              Create user
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Full name" htmlFor="new-user-name" required>
            <Input id="new-user-name" value={newName} onChange={(event) => setNewName(event.target.value)} />
          </Field>
          <Field label="Email address" htmlFor="new-user-email" required>
            <Input
              id="new-user-email"
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
            />
          </Field>
          <Field label="Roles" hint="Roles determine which workspaces this account can open." required>
            <div className="flex flex-wrap gap-1.5">
              {ALL_ROLES.map((role) => {
                const active = newRoles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setNewRoles((current) =>
                        current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
                      )
                    }
                    className={
                      active
                        ? "rounded-full border border-accent bg-accent/10 px-3 py-1 text-xs font-medium text-accent-hover"
                        : "rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-fg-muted hover:border-border-strong"
                    }
                  >
                    {role}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </Modal>

      {/* Temporary password — shown exactly once */}
      <Modal
        open={Boolean(createdUser)}
        onClose={() => {
          setCreatedUser(null);
          setCopied(false);
        }}
        title="User created"
        description={createdUser ? `Send this temporary password to ${createdUser.email} yourself — Slack, in person, however you'd normally reach them.` : undefined}
        size="sm"
        footer={
          <Button
            variant="primary"
            onClick={() => {
              setCreatedUser(null);
              setCopied(false);
            }}
          >
            Done
          </Button>
        }
      >
        {createdUser ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 p-3">
              <code className="font-mono text-base tracking-wide text-fg">{createdUser.tempPassword}</code>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(createdUser.tempPassword);
                  setCopied(true);
                  toast({ title: "Copied" });
                }}
              >
                {copied ? <IconCheck /> : <IconCopy />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-fg-muted">
              This is shown once and isn&apos;t stored anywhere retrievable — copy it now. They&apos;ll be
              asked to set their own password the moment they sign in with it.
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
