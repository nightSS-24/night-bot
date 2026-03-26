import "dotenv/config"

const { BOT_TOKEN, APP_ID } = process.env

const commands = [
  {
    name: "request",
    description: "Request an item",
    options: [
      {
        name: "item",
        description: "Item name",
        type: 3,
        required: true
      }
    ]
  },
  {
    name: "accept",
    description: "Accept a request",
    options: [
      {
        name: "user",
        description: "User ID",
        type: 3,
        required: true
      }
    ]
  },
  {
    name: "decline",
    description: "Decline a request",
    options: [
      {
        name: "user",
        description: "User ID",
        type: 3,
        required: true
      }
    ]
  },
  {
    name: "list",
    description: "Show active loans"
  }
]

async function register() {
  try {
    const response = await fetch(
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

    const data = await response.json()

    console.log("Status:", response.status)
    console.log(data)
  } catch (error) {
    console.error(error)
  }
}

register()
