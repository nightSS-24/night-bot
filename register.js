import fetch from "node-fetch";

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_ID = process.env.APP_ID;

const commands = [
  {
    name: "request",
    description: "Request to borrow an item",
    type: 1,
    options: [
      {
        name: "item",
        description: "Item you want",
        type: 3,
        required: true
      }
    ]
  },
  {
    name: "given",
    description: "Mark request/return as completed",
    type: 1
  },
  {
    name: "reminder",
    description: "Check remaining time for a user",
    type: 1,
    options: [
      {
        name: "user",
        description: "Target user",
        type: 6,
        required: true
      }
    ]
  },
  {
    name: "borrowers",
    description: "List all current borrowers",
    type: 1
  },
  {
    name: "return",
    description: "Start return process",
    type: 1
  },
  {
    name: "cancel",
    description: "Cancel current session",
    type: 1
  },
  {
    name: "ban-user",
    description: "Ban a user from system",
    type: 1,
    options: [
      {
        name: "user",
        description: "User to ban",
        type: 6,
        required: true
      }
    ]
  },
  {
    name: "search",
    description: "Check what a user has borrowed",
    type: 1,
    options: [
      {
        name: "user",
        description: "Target user",
        type: 6,
        required: true
      }
    ]
  },
  {
    name: "timeout",
    description: "Timeout a user",
    type: 1,
    options: [
      {
        name: "user",
        description: "User to timeout",
        type: 6,
        required: true
      },
      {
        name: "minutes",
        description: "Duration in minutes",
        type: 4,
        required: true
      }
    ]
  },
  {
    name: "trusted",
    description: "Mark user as trusted",
    type: 1,
    options: [
      {
        name: "user",
        description: "Target user",
        type: 6,
        required: true
      }
    ]
  },
  {
    name: "questions",
    description: "Get help from staff",
    type: 1
  },
  {
    name: "accept",
    description: "Accept a request manually",
    type: 1,
    options: [
      {
        name: "user",
        description: "User",
        type: 6,
        required: true
      },
      {
        name: "item",
        description: "Item",
        type: 3,
        required: true
      }
    ]
  },
  {
    name: "decline",
    description: "Decline a request manually",
    type: 1,
    options: [
      {
        name: "user",
        description: "User",
        type: 6,
        required: true
      }
    ]
  }
];

async function register() {
  const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(commands)
    });

    const text = await response.text();

    if (!response.ok) {
      console.error("Failed to register commands");
      console.error("Status:", response.status);
      console.error(text);
      return;
    }

    const data = JSON.parse(text);

    console.log("Commands registered");
    console.log("Status:", response.status);

    data.forEach(cmd => {
      console.log(`/${cmd.name}`);
    });

  } catch (err) {
    console.error("Unexpected error:", err);
  }
}

register();
