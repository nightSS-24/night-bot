import fetch from "node-fetch"
import "dotenv/config"

const { BOT_TOKEN, APP_ID } = process.env

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

  {
    name: "borrowers",
    description: "List all borrowers"
  },

  {
    name: "cancel",
    description: "Cancel your request"
  }
]

async function register() {
  const res = await fetch(
    `https://discord.com/api/v10/applications/${APP_ID}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(commands)
    }
  )

  const data = await res.json()

  console.log("STATUS:", res.status)
  console.log(data)
}

register()
