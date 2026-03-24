import mysql, { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import dotenv from 'dotenv';
import { logger } from './logger';

dotenv.config();

export { RowDataPacket, ResultSetHeader };

export const pool: Pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

const SEED_CATEGORIES = [
  { id: 'cat-blog-post',       name: 'blog-post',       description: 'Blog posts and articles', color: '#4F46E5' },
  { id: 'cat-email',           name: 'email',           description: 'Email correspondence',     color: '#0EA5E9' },
  { id: 'cat-social-media',    name: 'social-media',    description: 'Social media content',     color: '#EC4899' },
  { id: 'cat-technical-doc',   name: 'technical-doc',   description: 'Technical documentation', color: '#10B981' },
  { id: 'cat-personal-note',   name: 'personal-note',   description: 'Personal notes and journal entries', color: '#F59E0B' },
  { id: 'cat-presentation',    name: 'presentation',    description: 'Presentation scripts and slides', color: '#8B5CF6' },
  { id: 'cat-marketing-copy',  name: 'marketing-copy',  description: 'Marketing and promotional content', color: '#EF4444' },
  { id: 'cat-other',           name: 'other',           description: 'Miscellaneous content',    color: '#6B7280' },
];

export async function initDatabase(): Promise<void> {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id CHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        color VARCHAR(20),
        is_auto TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS tags (
        id CHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        color VARCHAR(20),
        is_custom TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS texts (
        id CHAR(36) PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        content LONGTEXT NOT NULL,
        word_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS text_categories (
        text_id CHAR(36) NOT NULL,
        category_id CHAR(36) NOT NULL,
        PRIMARY KEY (text_id, category_id),
        FOREIGN KEY (text_id) REFERENCES texts(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS text_tags (
        text_id CHAR(36) NOT NULL,
        tag_id CHAR(36) NOT NULL,
        PRIMARY KEY (text_id, tag_id),
        FOREIGN KEY (text_id) REFERENCES texts(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS rewrite_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        input_text LONGTEXT,
        output_text LONGTEXT,
        input_tokens INT,
        output_tokens INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Seed default categories
    for (const cat of SEED_CATEGORIES) {
      await pool.execute(
        `INSERT IGNORE INTO categories (id, name, description, color, is_auto) VALUES (?, ?, ?, ?, 1)`,
        [cat.id, cat.name, cat.description, cat.color]
      );
    }

    logger.log('[DB] Database initialized successfully');
  } catch (error) {
    logger.error('[DB] Failed to initialize database:', error);
    throw error;
  }
}
