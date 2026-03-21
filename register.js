import fetch from "node-fetch";
import "dotenv/config";

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_ID = process.env.APP_ID;
const GUILD_ID = process.env.GUILD_ID;

const commands = [
  {
    name: "request",
    description: "Request to borrow an item",
    options: [
      {
        name: "item",
        description: "Item you want",
        type: 3,
        required: true
      }
    ]
  },
  { name: "given", description: "Mark request/return as completed" },
  { name: "borrowers", description: "List all current borrowers" },
  { name: "return", description: "Start return process" },
  { name: "cancel", description: "Cancel current session" },

  {
    name: "reminder",
    description: "Check remaining time",
    options: [
      { name: "user", description: "Target user", type: 6, required: true }
    ]
  },

  {
    name: "ban-user",
    description: "Ban a user",
    options: [
      { name: "user", description: "User to ban", type: 6, required: true }
    ]
  },

  {
    name: "search",
    description: "Check borrowed item",
    options: [
      { name: "user", description: "Target user", type: 6, required: true }
    ]
  },

  {
    name: "timeout",
    description: "Timeout a user",
    options: [
      { name: "user", type: 6, required: true },
      { name: "minutes", type: 4, required: true }
    ]
  },

  {
    name: "trusted",
    description: "Mark user trusted",
    options: [
      { name: "user", type: 6, required: true }
    ]
  },

  { name: "questions", description: "Get help" },

  {
    name: "accept",
    description: "Accept manually",
    options: [
      { name: "user", type: 6, required: true },
      { name: "item", type: 3, required: true }
    ]
  },

  {
    name: "decline",
    description: "Decline manually",
    options: [
      { name: "user", type: 6, required: true }
    ]
  }
];

async function register() {
  const url = `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands)
  });

  console.log("Status:", res.status);
  console.log(await res.json());
}

register();
