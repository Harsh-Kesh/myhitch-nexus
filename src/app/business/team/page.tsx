"use client";

import {
  IconCopy,
  IconMail,
  IconPlus,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import type { TeamOverview } from "@/lib/server/teamInvitations";

export default function BusinessTeamPage() {
  const { toast } = useToast();
  const [data, setData] = React.useState<TeamOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<"editor" | "analyst">("editor");
  const [inviting, setInviting] = React.useState(false);
  const [actionInProgress, setActionInProgress] = React.useState<string | null>(null);

  const fetchTeam = React.useCallback(async () => {
    try {
      const res = await fetch("/api/business/team");
      if (!res.ok) throw new Error("Failed to load team");
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      toast({
        tone: "error",
        title: "Could not load team members",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    try {
      const res = await fetch("/api/business/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to send invitation");
      }

      toast({
        tone: "success",
        title: "Invitation sent",
        description: `Invited ${inviteEmail} as ${inviteRole}.`,
      });
      setInviteEmail("");
      fetchTeam();
    } catch (err: unknown) {
      toast({
        tone: "error",
        title: "Invitation failed",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    setActionInProgress(inviteId);
    try {
      const res = await fetch(`/api/business/team/invite/${inviteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "Failed to revoke invitation");
      }
      toast({
        tone: "info",
        title: "Invitation revoked",
      });
      fetchTeam();
    } catch (err: unknown) {
      toast({
        tone: "error",
        title: "Failed to revoke invitation",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRemoveMember = async (membershipId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from this organization?`)) {
      return;
    }
    setActionInProgress(membershipId);
    try {
      const res = await fetch(`/api/business/team/member/${membershipId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || "Failed to remove member");
      }
      toast({
        tone: "info",
        title: "Member removed",
      });
      fetchTeam();
    } catch (err: unknown) {
      toast({
        tone: "error",
        title: "Failed to remove member",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/business/join?token=${token}`;
    navigator.clipboard.writeText(url);
    toast({
      tone: "success",
      title: "Invite link copied",
      description: "Share this link with your team member to let them join.",
    });
  };

  const seatsUsed = data?.totalSeatsUsed ?? 0;
  // null means unlimited seats — a real Enterprise plan has no self-service checkout (it's
  // a sales-closed deal, see organizations.seat_limit's migration comment), set by a
  // super-admin after that deal closes, not derived from anything the client can toggle.
  const maxSeats = data?.maxSeats ?? 5;
  const unlimitedSeats = maxSeats === null;
  const seatsAvailable = unlimitedSeats ? null : Math.max(0, maxSeats - seatsUsed);
  const seatsPercentage = unlimitedSeats ? 0 : Math.min(100, Math.round((seatsUsed / maxSeats) * 100));
  const atSeatLimit = !unlimitedSeats && seatsUsed >= maxSeats;

  return (
    <>
      <PageHeader
        title="Team members"
        description="Manage your business team seats and invite colleagues to collaborate."
      />

      <PageBody className="space-y-6">
        {/* Seat Usage Overview */}
        <Card>
          <CardBody>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <IconUsers className="size-5 text-accent" />
                  <h3 className="text-base font-semibold text-fg">
                    Business Plan Seat Allocation
                  </h3>
                  <Badge tone={atSeatLimit ? "warning" : "success"}>
                    {unlimitedSeats ? `${seatsUsed} seats used` : `${seatsUsed} of ${maxSeats} Seats Used`}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-fg-muted">
                  {unlimitedSeats
                    ? "Your Enterprise plan includes unlimited employee seats with role-based permissions."
                    : `The Business plan includes up to ${maxSeats} employee seats with role-based permissions.`}
                </p>
              </div>

              {atSeatLimit ? (
                <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                  <span>Need more seats?</span>
                  <a href="/business/billing" className="font-semibold underline hover:text-fg">
                    Upgrade to Enterprise
                  </a>
                </div>
              ) : null}
            </div>

            {!unlimitedSeats && (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full transition-all duration-300 ${
                      seatsPercentage >= 100
                        ? "bg-warning"
                        : "bg-accent"
                    }`}
                    style={{ width: `${seatsPercentage}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-xs text-fg-subtle">
                  <span>{seatsAvailable} seat{seatsAvailable === 1 ? "" : "s"} remaining</span>
                  <span>Max {maxSeats} seats</span>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Invite New Team Member Form */}
        <Card>
          <CardHeader
            title="Invite team member"
            description="Send an invitation link to grant access to your Business Studio."
          />
          <CardBody>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-12 sm:items-end">
                <Field
                  label="Colleague email"
                  htmlFor="invite-email"
                  className="sm:col-span-6"
                  required
                >
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="colleague@yourcompany.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    disabled={atSeatLimit || inviting}
                  />
                </Field>

                <Field
                  label="Role & permissions"
                  htmlFor="invite-role"
                  className="sm:col-span-4"
                >
                  <Select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "editor" | "analyst")}
                    disabled={atSeatLimit || inviting}
                  >
                    <option value="editor">Editor (manage content, campaigns, leads)</option>
                    <option value="analyst">Analyst (view-only analytics & reports)</option>
                  </Select>
                </Field>

                <div className="sm:col-span-2">
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    loading={inviting}
                    disabled={atSeatLimit || !inviteEmail.trim()}
                  >
                    <IconPlus className="size-4" />
                    Invite
                  </Button>
                </div>
              </div>

              {atSeatLimit && (
                <p className="text-xs text-warning">
                  You have reached the maximum of {maxSeats} seats for your plan. Remove an existing member or invitation to invite someone new.
                </p>
              )}
            </form>
          </CardBody>
        </Card>

        {/* Active Members Table */}
        <Card>
          <CardHeader
            title="Active members"
            description="People who currently have access to this organization."
          />
          <CardBody>
            {loading ? (
              <p className="text-sm text-fg-muted">Loading team members...</p>
            ) : !data?.members || data.members.length === 0 ? (
              <p className="text-sm text-fg-muted">No members found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase text-fg-subtle">
                      <th className="pb-3 font-medium">User</th>
                      <th className="pb-3 font-medium">Role</th>
                      <th className="pb-3 font-medium">Joined</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.members.map((member) => (
                      <tr key={member.id} className="group">
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-fg">
                              {member.avatarUrl ? (
                                <img
                                  src={member.avatarUrl}
                                  alt={member.name}
                                  className="size-9 rounded-full object-cover"
                                />
                              ) : (
                                (member.name || member.email || "U")[0].toUpperCase()
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-fg">{member.name}</p>
                              <p className="text-xs text-fg-muted">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <Badge
                            tone={
                              member.role === "owner"
                                ? "accent"
                                : member.role === "editor"
                                  ? "info"
                                  : "neutral"
                            }
                          >
                            {member.role}
                          </Badge>
                        </td>
                        <td className="py-3 text-xs text-fg-muted">
                          {formatDate(member.createdAt, "short")}
                        </td>
                        <td className="py-3 text-right">
                          {member.role !== "owner" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger hover:bg-danger/10"
                              loading={actionInProgress === member.id}
                              onClick={() => handleRemoveMember(member.id, member.name)}
                            >
                              <IconTrash className="size-4" />
                              Remove
                            </Button>
                          ) : (
                            <span className="text-xs text-fg-subtle">Owner</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Pending Invitations Table */}
        {data?.pendingInvitations && data.pendingInvitations.length > 0 && (
          <Card>
            <CardHeader
              title="Pending invitations"
              description="Invitations that have been sent but not yet accepted."
            />
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase text-fg-subtle">
                      <th className="pb-3 font-medium">Recipient</th>
                      <th className="pb-3 font-medium">Invited Role</th>
                      <th className="pb-3 font-medium">Expires</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.pendingInvitations.map((invitation) => (
                      <tr key={invitation.id}>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <IconMail className="size-4 text-fg-subtle" />
                            <span className="font-medium text-fg">{invitation.email}</span>
                          </div>
                        </td>
                        <td className="py-3">
                          <Badge tone="neutral">{invitation.role}</Badge>
                        </td>
                        <td className="py-3 text-xs text-fg-muted">
                          {formatDate(invitation.expiresAt, "short")}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => copyInviteLink(invitation.token)}
                            >
                              <IconCopy className="size-3.5" />
                              Copy link
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger hover:bg-danger/10"
                              loading={actionInProgress === invitation.id}
                              onClick={() => handleRevoke(invitation.id)}
                            >
                              <IconTrash className="size-3.5" />
                              Revoke
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )}
      </PageBody>
    </>
  );
}
