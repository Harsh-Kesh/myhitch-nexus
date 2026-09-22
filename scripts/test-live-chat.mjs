import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runTest() {
  console.log("=== Testing Live Chat & Polls (FR-6.5.3, FR-6.5.4) ===");
  const client = await pool.connect();

  try {
    const streamId = "live_test_stream_001";

    // 1. Post a live chat message
    const insertMsg = await client.query(
      `insert into live_chat_messages (
        stream_id, author_name, author_role, message
      ) values ($1, $2, $3, $4)
      returning *`,
      [streamId, "Test Supporter", "subscriber", "Hello from automated test!"],
    );
    const msg = insertMsg.rows[0];
    console.log(`[PASS] Posted live chat message: id=${msg.id}, author=${msg.author_name}`);

    // 2. Pin message
    await client.query(`update live_chat_messages set is_pinned = true where id = $1`, [msg.id]);
    const pinnedCheck = await client.query(`select is_pinned from live_chat_messages where id = $1`, [msg.id]);
    if (!pinnedCheck.rows[0].is_pinned) throw new Error("Failed to pin message");
    console.log(`[PASS] Pinned live chat message successfully`);

    // 3. Create a live poll
    const options = [
      { text: "Release Behind-the-scenes", votes: 0 },
      { text: "Live Q&A Session", votes: 0 },
    ];
    const pollInsert = await client.query(
      `insert into live_stream_polls (stream_id, question, options)
       values ($1, $2, $3::jsonb)
       returning *`,
      [streamId, "What should we stream next week?", JSON.stringify(options)],
    );
    const poll = pollInsert.rows[0];
    console.log(`[PASS] Created live poll: id=${poll.id}, question="${poll.question}"`);

    // 4. Clean up test data
    await client.query(`delete from live_chat_messages where stream_id = $1`, [streamId]);
    await client.query(`delete from live_stream_polls where stream_id = $1`, [streamId]);
    console.log(`[PASS] Cleaned up live test data.`);

    console.log("\n>>> LIVE CHAT & POLLS TEST 100% PASSED! <<<");
  } finally {
    client.release();
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
