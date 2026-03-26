import { verifyKey } from "discord-interactions"
import { MongoClient } from "mongodb"

const { PUBLIC_KEY, NightBot_MONGODB_URI } = process.env

let client = null
let db = null

async function getDB() {
  if (!client) {
    client = new MongoClient(NightBot_MONGODB_URI)
    await client.connect()
    db = client.db("system")
  }
  return db
}

async function sendFollowUp(interaction, content) {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ content })
      }
    )

    if (!response.ok) {
      const text = await response.text()
      console.error(text)
    }
  } catch (error) {
    console.error(error)
  }
}

async function handleCommand(interaction) {
  try {
    const database = await getDB()
    const Borrow = database.collection("borrowed")

    const userId =
      interaction.member?.user?.id || interaction.user?.id

    const command = interaction.data?.name

    if (command === "request") {
      const item = interaction.data.options?.[0]?.value

      if (!item) {
        await sendFollowUp(interaction, "Invalid item")
        return
      }

      await Borrow.insertOne({
        userId,
        item,
        status: "pending",
        time: new Date()
      })

      await sendFollowUp(interaction, `Requested ${item}`)
    }

    else if (command === "accept") {
      const target = interaction.data.options?.[0]?.value

      if (!target) {
        await sendFollowUp(interaction, "Invalid user")
        return
      }

      const request = await Borrow.findOne({
        userId: target,
        status: "pending"
      })

      if (!request) {
        await sendFollowUp(interaction, "No request found")
        return
      }

      await Borrow.updateOne(
        { _id: request._id },
        { $set: { status: "accepted" } }
      )

      await sendFollowUp(interaction, `Accepted ${request.item}`)
    }

    else if (command === "decline") {
      const target = interaction.data.options?.[0]?.value

      if (!target) {
        await sendFollowUp(interaction, "Invalid user")
        return
      }

      const request = await Borrow.findOne({
        userId: target,
        status: "pending"
      })

      if (!request) {
        await sendFollowUp(interaction, "No request found")
        return
      }

      await Borrow.updateOne(
        { _id: request._id },
        { $set: { status: "declined" } }
      )

      await sendFollowUp(interaction, `Declined ${request.item}`)
    }

    else if (command === "list") {
      const list = await Borrow.find({
        status: "accepted"
      }).toArray()

      if (!list.length) {
        await sendFollowUp(interaction, "No active loans")
        return
      }

      const text = list
        .map(entry => `<@${entry.userId}> -> ${entry.item}`)
        .join("\n")

      await sendFollowUp(interaction, `Loans:\n${text}`)
    }
  } catch (error) {
    console.error(error)
    await sendFollowUp(interaction, "Error occurred")
  }
}

export default async function handler(req, res) {
  try {
    const signature = req.headers["x-signature-ed25519"]
    const timestamp = req.headers["x-signature-timestamp"]

    const rawBody = req.rawBody
      ? req.rawBody.toString()
      : JSON.stringify(req.body)

    const isValid = verifyKey(
      rawBody,
      signature,
      timestamp,
      PUBLIC_KEY
    )

    if (!isValid) {
      return res.status(401).send("Invalid request")
    }

    const interaction = req.body

    if (interaction.type === 1) {
      return res.status(200).json({ type: 1 })
    }

    if (interaction.type === 2) {
      res.status(200).json({ type: 5 })
      handleCommand(interaction)
      return
    }

    return res.status(400).send("Unhandled interaction")
  } catch (error) {
    console.error(error)
    return res.status(500).send("Server error")
  }
}
