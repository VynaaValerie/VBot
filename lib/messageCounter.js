import pg from 'pg';

const { Pool } = pg;

let pool = null;
let isInitialized = false;

export async function initDatabase() {
    if (isInitialized) return true;
    
    if (!process.env.DATABASE_URL) {
        console.log('DATABASE_URL not found, message counter disabled');
        return false;
    }

    try {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });

        await pool.query(`
            CREATE TABLE IF NOT EXISTS message_counts (
                id SERIAL PRIMARY KEY,
                group_id VARCHAR(100) NOT NULL,
                user_id VARCHAR(100) NOT NULL,
                username VARCHAR(100),
                count INTEGER DEFAULT 0,
                last_message TIMESTAMP DEFAULT NOW(),
                UNIQUE(group_id, user_id)
            )
        `);

        isInitialized = true;
        console.log('Message counter database initialized');
        return true;
    } catch (error) {
        console.error('Database init error:', error);
        return false;
    }
}

export async function incrementMessageCount(groupId, userId, username) {
    if (!pool) return null;

    try {
        const result = await pool.query(`
            INSERT INTO message_counts (group_id, user_id, username, count, last_message)
            VALUES ($1, $2, $3, 1, NOW())
            ON CONFLICT (group_id, user_id)
            DO UPDATE SET 
                count = message_counts.count + 1,
                username = COALESCE($3, message_counts.username),
                last_message = NOW()
            RETURNING count
        `, [groupId, userId, username]);

        return result.rows[0]?.count || 0;
    } catch (error) {
        console.error('Increment count error:', error);
        return null;
    }
}

export async function getMessageCounts(groupId, limit = 50) {
    if (!pool) return [];

    try {
        const result = await pool.query(`
            SELECT user_id, username, count, last_message
            FROM message_counts
            WHERE group_id = $1
            ORDER BY count DESC
            LIMIT $2
        `, [groupId, limit]);

        return result.rows;
    } catch (error) {
        console.error('Get counts error:', error);
        return [];
    }
}

export async function getUserMessageCount(groupId, userId) {
    if (!pool) return null;

    try {
        const result = await pool.query(`
            SELECT count, username
            FROM message_counts
            WHERE group_id = $1 AND user_id = $2
        `, [groupId, userId]);

        return result.rows[0] || null;
    } catch (error) {
        console.error('Get user count error:', error);
        return null;
    }
}

export async function clearMessageCounts(groupId) {
    if (!pool) return false;

    try {
        await pool.query(`
            DELETE FROM message_counts WHERE group_id = $1
        `, [groupId]);

        return true;
    } catch (error) {
        console.error('Clear counts error:', error);
        return false;
    }
}

export async function getTopUsers(groupId, count = 10) {
    if (!pool) return [];

    try {
        const result = await pool.query(`
            SELECT user_id, username, count
            FROM message_counts
            WHERE group_id = $1
            ORDER BY count DESC
            LIMIT $2
        `, [groupId, count]);

        return result.rows;
    } catch (error) {
        console.error('Get top users error:', error);
        return [];
    }
}
