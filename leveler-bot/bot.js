import http from 'http';

http.createServer((req, res) => {
  res.write("Lounge Bot is running!");
  res.end();
}).listen(process.env.PORT || 3000);
import { Bot } from './yapper.js';
import Database from 'better-sqlite3'; // Lightweight local DB for storage

const bot = new Bot('yb_0fd8dd10.uWr8f791PUkKk9C6uIjCteJIkNMW5BpRpaQthCAs');

// Initialize SQLite database for persistent user stats
const db = new Database('lounge_stats.db');

// Create tables for XP and Join Tracking if they don't exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    userId TEXT PRIMARY KEY,
    username TEXT,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,
    joinedTimestamp INTEGER
  )
`).run();

// Cooldown tracker to prevent spamming XP (userId -> timestamp)
const xpCooldowns = new Map();

// Configuration for Level Role Rewards (Change IDs to match your actual Yapper Role IDs)
const LEVEL_ROLES = {
  5: 'ROLE_ID_LEVEL_5',
  15: 'ROLE_ID_LEVEL_15',
  30: 'ROLE_ID_LEVEL_30',
  50: 'ROLE_ID_LEVEL_50'
};

// Basic ping check
bot.command('ping', 'Check the bot is alive', (ctx) => ctx.reply('pong 🏓'));

// Handle user joining (Save join timestamp for future loyalty/age system)
bot.on('guildMemberAdd', (member) => {
  const stmt = db.prepare(`
    INSERT INTO users (userId, username, xp, level, joinedTimestamp) 
    VALUES (?, ?, 0, 0, ?)
    ON CONFLICT(userId) DO UPDATE SET joinedTimestamp = ?
  `);
  stmt.run(member.id, member.username, Date.now(), Date.now());
});

// Main message listener for XP leveling & activity
bot.on('message', async (msg) => {
  // Ignore bots or direct messages
  if (msg.author.bot || !msg.guild) return;

  const userId = msg.author.id;
  const now = Date.now();

  // 1. Ensure user exists in database with join timestamp
  let user = db.prepare('SELECT * FROM users WHERE userId = ?').get(userId);
  if (!user) {
    db.prepare('INSERT INTO users (userId, username, xp, level, joinedTimestamp) VALUES (?, ?, 0, 0, ?)')
      .run(userId, msg.author.username, now);
    user = { xp: 0, level: 0, joinedTimestamp: now };
  }

  // 2. Cooldown check (60 seconds per user)
  const lastMessageTime = xpCooldowns.get(userId) || 0;
  if (now - lastMessageTime < 60000) return; 
  xpCooldowns.set(userId, now);

  // 3. Award random XP (e.g., between 15 and 25 XP)
  const xpEarned = Math.floor(Math.random() * 11) + 15;
  const newXp = user.xp + xpEarned;
  
  // XP formula: Required XP for next level = 5 * (level ^ 2) + (50 * level) + 100
  const xpNeeded = 5 * (user.level ** 2) + (50 * user.level) + 100;
  let newLevel = user.level;

  // 4. Level Up Check
  if (newXp >= xpNeeded) {
    newLevel += 1;
    msg.channel.send(`🎉 Congrats <@${userId}>, you leveled up to **Level ${newLevel}**! ⚡`);

    // Assign role reward if configured
    if (LEVEL_ROLES[newLevel]) {
      try {
        await msg.guild.members.cache.get(userId).roles.add(LEVEL_ROLES[newLevel]);
      } catch (err) {
        console.error('Failed to assign level role:', err);
      }
    }
  }

  // 5. Update Database
  db.prepare('UPDATE users SET xp = ?, level = ? WHERE userId = ?').run(newXp, newLevel, userId);
});

// Command: Check Rank / XP Progress
bot.command('rank', 'Check your current level and XP', async (ctx) => {
  const user = db.prepare('SELECT * FROM users WHERE userId = ?').get(ctx.author.id);
  if (!user) return ctx.reply('You haven earned any XP yet! Start chatting.');

  const xpNeeded = 5 * (user.level ** 2) + (50 * user.level) + 100;
  ctx.reply(`📊 **${ctx.author.username}'s Rank:**\nLevel: **${user.level}**\nXP: **${user.xp} / ${xpNeeded}**`);
});

// Command: Leaderboard
bot.command('leaderboard', 'Show the top 10 most active members', async (ctx) => {
  const topUsers = db.prepare('SELECT username, level, xp FROM users ORDER BY level DESC, xp DESC LIMIT 10').all();
  
  if (topUsers.length === 0) return ctx.reply('No leaderboard data available yet.');

  let desc = topUsers.map((u, index) => `**${index + 1}.** ${u.username} — Level ${u.level} (${u.xp} XP)`).join('\n');
  ctx.reply(`🏆 **The Lounge HQ — Leaderboard**\n\n${desc}`);
});

// Future Loyalty / Age Bot Function (Checks account age / join age daily)
setInterval(() => {
  const allUsers = db.prepare('SELECT userId, joinedTimestamp FROM users').all();
  const now = Date.now();

  for (const user of allUsers) {
    const daysInServer = (now - user.joinedTimestamp) / (1000 * 60 * 60 * 24);
    
    // Example logic for future automated loyalty roles:
    // if (daysInServer >= 365) { /* assign 1 Year role */ }
    // else if (daysInServer >= 180) { /* assign 6 Months role */ }
  }
}, 1000 * 60 * 60 * 24); // Runs once every 24 hours

bot.start();