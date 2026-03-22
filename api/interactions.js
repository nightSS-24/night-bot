import { verifyKey } from "discord-interactions"
import { MongoClient } from "mongodb"

// ===== ENV =====
const { PUBLIC_KEY, NightBot_MONGODB_URI } = process.env

// ===== Mongo (cached) =====
let client
let db

async function getDB() {
  if (!client) {
    client = new MongoClient(NightBot_MONGODB_URI)
    await client.connect()
    db = client.db("system")
    console.log("✅ Mongo Connected")
  }
  return db
}

// ===== Send Followup =====
async function sendFollowUp(interaction, content) {
  await fetch(
    `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    }
  )
}

// ===== Command Logic =====
async function handleCommand(interaction) {
  try {
    const db = await getDB()
    const Borrow = db.collection("borrowed")

    const userId = interaction.member.user.id
    const cmd = interaction.data.name

    // ===== REQUEST =====
    if (cmd === "request") {
      const item = interaction.data.options?.[0]?.value

      await Borrow.insertOne({
        userId,
        item,
        status: "pending",
        time: new Date()
      })

      await sendFollowUp(interaction, `✅ Requested **${item}**`)
    }

    // ===== ACCEPT =====
    else if (cmd === "accept") {
      const target = interaction.data.options?.[0]?.value

      const req = await Borrow.findOne({
        userId: target,
        status: "pending"
      })

      if (!req) {
        return await sendFollowUp(interaction, "❌ No request found")
      }

      await Borrow.updateOne(
        { _id: req._id },
        { $set: { status: "accepted" } }
      )

      await sendFollowUp(interaction, `✅ Accepted **${req.item}**`)
    }

    // ===== DECLINE =====
    else if (cmd === "decline") {
      const target = interaction.data.options?.[0]?.value

      const req = await Borrow.findOne({
        userId: target,
        status: "pending"
      })

      if (!req) {
        return await sendFollowUp(interaction, "❌ No request found")
      }

      await Borrow.updateOne(
        { _id: req._id },
        { $set: { status: "declined" } }
      )

      await sendFollowUp(interaction, `🚫 Declined **${req.item}**`)
    }

    // ===== LIST =====
    else if (cmd === "list") {
      const list = await Borrow.find({ status: "accepted" }).toArray()

      if (!list.length) {
        return await sendFollowUp(interaction, "📭 No active loans")
      }

      const text = list
        .map(x => `<@${x.userId}> → **${x.item}**`)
        .join("\n")

      await sendFollowUp(interaction, `📜 Loans:\n${text}`)
    }

  } catch (err) {
    console.error("🔥 COMMAND ERROR:", err)
    await sendFollowUp(interaction, "❌ Error happened")
  }
}

// ===== MAIN HANDLER =====
export default async function handler(req, res) {
  try {
    const signature = req.headers["x-signature-ed25519"]
    const timestamp = req.headers["x-signature-timestamp"]
    const body = JSON.stringify(req.body)

    // ✅ VERIFY
    if (!verifyKey(body, signature, timestamp, PUBLIC_KEY)) {
      return res.status(401).send("Invalid request")
    }

    const interaction = req.body

    // ===== PING =====
    if (interaction.type === 1) {
      return res.json({ type: 1 })
    }

    // ===== COMMAND =====
    if (interaction.type === 2) {
      // ✅ IMMEDIATE RESPONSE (THIS FIXES "thinking...")
      res.json({
        type: 5 // DEFERRED RESPONSE
      })

      // run async AFTER responding
      handleCommand(interaction)
      return
    }

  } catch (err) {
    console.error("🔥 HANDLER ERROR:", err)
    return res.status(500).send("Server error")
  }
}
