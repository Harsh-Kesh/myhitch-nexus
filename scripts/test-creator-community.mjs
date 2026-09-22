import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runTest() {
  console.log("=== Testing Creator Community Posts & Discussions ===");
  const client = await pool.connect();

  try {
    // 1. Get an existing organization/channel
    const orgRes = await client.query("select id, name from organizations limit 1");
    if (orgRes.rows.length === 0) throw new Error("No organization found");
    const channel = orgRes.rows[0];
    console.log(`[PASS] Using channel: ${channel.name} (${channel.id})`);

    // 2. Insert a creator community post
    const insertPost = await client.query(
      `insert into creator_posts (
        channel_id, title, content, audience, pinned
      ) values ($1, $2, $3, $4, $5)
      returning *`,
      [
        channel.id,
        "Behind the Scenes: New Release Coming Friday!",
        "Excited to share our newest documentary episode with everyone this Friday at 6 PM AEST. Drop your questions below!",
        "public",
        true,
      ],
    );
    const post = insertPost.rows[0];
    console.log(`[PASS] Created creator post: id=${post.id}, title="${post.title}"`);

    // 3. Like the post
    const accountRes = await client.query("select id, full_name from accounts limit 1");
    const account = accountRes.rows[0];
    if (account) {
      await client.query(
        `insert into creator_post_likes (post_id, account_id) values ($1, $2)`,
        [post.id, account.id],
      );
      await client.query(`update creator_posts set likes_count = likes_count + 1 where id = $1`, [post.id]);
      console.log(`[PASS] Liked post by account: ${account.full_name}`);
    }

    // 4. Add a comment
    const insertComment = await client.query(
      `insert into creator_post_comments (
        post_id, account_id, author_name, content
      ) values ($1, $2, $3, $4)
      returning *`,
      [post.id, account?.id ?? null, "Fan Supporter", "Can't wait! Will there be a 4K version?"],
    );
    const comment = insertComment.rows[0];
    await client.query(`update creator_posts set comments_count = comments_count + 1 where id = $1`, [post.id]);
    console.log(`[PASS] Added comment: id=${comment.id}, text="${comment.content}"`);

    // 5. Query posts and comments
    const postsQuery = await client.query(
      `select id, title, likes_count, comments_count from creator_posts where id = $1`,
      [post.id],
    );
    const queried = postsQuery.rows[0];
    if (queried.comments_count !== 1) throw new Error("Comment count mismatch");
    console.log(`[PASS] Verified post counts: likes=${queried.likes_count}, comments=${queried.comments_count}`);

    // 6. Clean up test data
    await client.query(`delete from creator_post_comments where post_id = $1`, [post.id]);
    await client.query(`delete from creator_post_likes where post_id = $1`, [post.id]);
    await client.query(`delete from creator_posts where id = $1`, [post.id]);
    console.log(`[PASS] Cleaned up community test data.`);

    console.log("\n>>> CREATOR COMMUNITY TEST 100% PASSED! <<<");
  } finally {
    client.release();
    await pool.end();
  }
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
