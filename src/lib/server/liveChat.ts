// Server-only. Live Stream Interactive Chat & Viewer Polls (FR-6.5.3, FR-6.5.4)
import "server-only";
import { query, queryOne } from "./db";

export interface LiveChatMessage {
  id: string;
  streamId: string;
  accountId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  authorRole: "viewer" | "creator" | "moderator" | "subscriber";
  message: string;
  isPinned: boolean;
  createdAt: string;
}

interface ChatMessageRow {
  id: string;
  stream_id: string;
  account_id: string | null;
  author_name: string;
  author_avatar_url: string | null;
  author_role: "viewer" | "creator" | "moderator" | "subscriber";
  message: string;
  is_pinned: boolean;
  created_at: string;
}

export interface PollOption {
  text: string;
  votes: number;
}

export interface LiveStreamPoll {
  id: string;
  streamId: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  status: "active" | "ended";
  userVotedIndex: number | null;
  createdAt: string;
  endedAt: string | null;
}

interface PollRow {
  id: string;
  stream_id: string;
  question: string;
  options: PollOption[];
  status: "active" | "ended";
  created_at: string;
  ended_at: string | null;
}

/* -------------------------------------------------------------------------- */
/*                              1. Live Chat                                  */
/* -------------------------------------------------------------------------- */

export async function getLiveChatMessages(
  streamId: string,
  limit = 50,
  since?: string,
): Promise<LiveChatMessage[]> {
  const params: unknown[] = [streamId];
  let where = "stream_id = $1 and deleted_at is null";

  if (since) {
    params.push(since);
    where += ` and created_at > $${params.length}`;
  }

  params.push(Math.min(limit, 100));
  const limitIndex = params.length;

  const rows = await query<ChatMessageRow>(
    `select id, stream_id, account_id, author_name, author_avatar_url,
            author_role, message, is_pinned, created_at
     from live_chat_messages
     where ${where}
     order by created_at asc
     limit $${limitIndex}`,
    params,
  );

  return rows.map((r) => ({
    id: r.id,
    streamId: r.stream_id,
    accountId: r.account_id,
    authorName: r.author_name,
    authorAvatarUrl: r.author_avatar_url,
    authorRole: r.author_role,
    message: r.message,
    isPinned: r.is_pinned,
    createdAt: r.created_at,
  }));
}

export async function postLiveChatMessage(input: {
  streamId: string;
  accountId?: string | null;
  authorName: string;
  authorAvatarUrl?: string | null;
  authorRole?: "viewer" | "creator" | "moderator" | "subscriber";
  message: string;
}): Promise<LiveChatMessage> {
  const trimmed = input.message.trim();
  if (!trimmed) throw new Error("Message cannot be empty");

  const row = await queryOne<ChatMessageRow>(
    `insert into live_chat_messages (
      stream_id, account_id, author_name, author_avatar_url, author_role, message
    ) values ($1, $2, $3, $4, $5, $6)
    returning id, stream_id, account_id, author_name, author_avatar_url,
              author_role, message, is_pinned, created_at`,
    [
      input.streamId,
      input.accountId ?? null,
      input.authorName.trim() || "Viewer",
      input.authorAvatarUrl ?? null,
      input.authorRole ?? "viewer",
      trimmed,
    ],
  );

  if (!row) throw new Error("Failed to insert live chat message");

  return {
    id: row.id,
    streamId: row.stream_id,
    accountId: row.account_id,
    authorName: row.author_name,
    authorAvatarUrl: row.author_avatar_url,
    authorRole: row.author_role,
    message: row.message,
    isPinned: row.is_pinned,
    createdAt: row.created_at,
  };
}

export async function pinLiveChatMessage(
  messageId: string,
  streamId: string,
): Promise<boolean> {
  await query(
    `update live_chat_messages set is_pinned = false where stream_id = $1`,
    [streamId],
  );

  const updated = await queryOne<{ id: string }>(
    `update live_chat_messages set is_pinned = true where id = $1 and stream_id = $2 returning id`,
    [messageId, streamId],
  );

  return Boolean(updated);
}

export async function deleteLiveChatMessage(
  messageId: string,
  streamId: string,
): Promise<boolean> {
  const updated = await queryOne<{ id: string }>(
    `update live_chat_messages set deleted_at = now() where id = $1 and stream_id = $2 returning id`,
    [messageId, streamId],
  );

  return Boolean(updated);
}

/* -------------------------------------------------------------------------- */
/*                              2. Live Polls                                 */
/* -------------------------------------------------------------------------- */

export async function getActivePoll(
  streamId: string,
  accountId?: string | null,
): Promise<LiveStreamPoll | null> {
  const poll = await queryOne<PollRow>(
    `select id, stream_id, question, options, status, created_at, ended_at
     from live_stream_polls
     where stream_id = $1 and status = 'active'
     order by created_at desc
     limit 1`,
    [streamId],
  );

  if (!poll) return null;

  let userVotedIndex: number | null = null;
  if (accountId) {
    const voteRow = await queryOne<{ option_index: number }>(
      `select option_index from live_stream_poll_votes where poll_id = $1 and account_id = $2`,
      [poll.id, accountId],
    );
    if (voteRow) userVotedIndex = voteRow.option_index;
  }

  const options: PollOption[] = Array.isArray(poll.options) ? poll.options : [];
  const totalVotes = options.reduce((sum, opt) => sum + (opt.votes || 0), 0);

  return {
    id: poll.id,
    streamId: poll.stream_id,
    question: poll.question,
    options,
    totalVotes,
    status: poll.status,
    userVotedIndex,
    createdAt: poll.created_at,
    endedAt: poll.ended_at,
  };
}

export async function createLivePoll(
  streamId: string,
  question: string,
  optionTexts: string[],
): Promise<LiveStreamPoll> {
  if (optionTexts.length < 2) throw new Error("A poll requires at least 2 options");

  // End existing active polls
  await query(
    `update live_stream_polls set status = 'ended', ended_at = now() where stream_id = $1 and status = 'active'`,
    [streamId],
  );

  const optionsJson = JSON.stringify(
    optionTexts.map((text) => ({ text: text.trim(), votes: 0 })),
  );

  const poll = await queryOne<PollRow>(
    `insert into live_stream_polls (stream_id, question, options)
     values ($1, $2, $3::jsonb)
     returning id, stream_id, question, options, status, created_at, ended_at`,
    [streamId, question.trim(), optionsJson],
  );

  if (!poll) throw new Error("Failed to create live poll");

  const options: PollOption[] = Array.isArray(poll.options) ? poll.options : [];
  return {
    id: poll.id,
    streamId: poll.stream_id,
    question: poll.question,
    options,
    totalVotes: 0,
    status: "active",
    userVotedIndex: null,
    createdAt: poll.created_at,
    endedAt: null,
  };
}

export async function voteLivePoll(
  pollId: string,
  accountId: string,
  optionIndex: number,
): Promise<LiveStreamPoll> {
  // Check if poll exists and is active
  const poll = await queryOne<PollRow>(
    `select id, stream_id, question, options, status, created_at, ended_at
     from live_stream_polls where id = $1 and status = 'active'`,
    [pollId],
  );

  if (!poll) throw new Error("Poll not found or has ended");

  const options: PollOption[] = Array.isArray(poll.options) ? poll.options : [];
  if (optionIndex < 0 || optionIndex >= options.length) {
    throw new Error("Invalid option index");
  }

  // Insert vote record (unique per poll_id + account_id)
  await query(
    `insert into live_stream_poll_votes (poll_id, account_id, option_index)
     values ($1, $2, $3)
     on conflict (poll_id, account_id) do update set option_index = excluded.option_index`,
    [pollId, accountId, optionIndex],
  );

  // Recalculate options votes count atomically from live_stream_poll_votes
  const voteCounts = await query<{ option_index: number; count: string }>(
    `select option_index, count(*) as count from live_stream_poll_votes where poll_id = $1 group by option_index`,
    [pollId],
  );

  const countMap = new Map<number, number>();
  for (const row of voteCounts) {
    countMap.set(row.option_index, parseInt(row.count, 10));
  }

  const updatedOptions = options.map((opt, idx) => ({
    text: opt.text,
    votes: countMap.get(idx) ?? 0,
  }));

  await query(
    `update live_stream_polls set options = $1::jsonb where id = $2`,
    [JSON.stringify(updatedOptions), pollId],
  );

  const totalVotes = updatedOptions.reduce((sum, opt) => sum + opt.votes, 0);

  return {
    id: poll.id,
    streamId: poll.stream_id,
    question: poll.question,
    options: updatedOptions,
    totalVotes,
    status: "active",
    userVotedIndex: optionIndex,
    createdAt: poll.created_at,
    endedAt: poll.ended_at,
  };
}

export async function endLivePoll(
  pollId: string,
  streamId: string,
): Promise<boolean> {
  const result = await query(
    `update live_stream_polls set status = 'ended', ended_at = now() where id = $1 and stream_id = $2`,
    [pollId, streamId],
  );
  return result.length > 0;
}
