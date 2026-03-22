import { verifyKey } from "discord-interactions"
import { MongoClient } from "mongodb"

// ENV
const {
  PUBLIC_KEY,
  BOT_TOKEN,
  CATEGORY_ID,
  LOG_CHANNEL,
  NightBot_MONGODB_URI,
  COMMUNITY_ROLE,
  HELPER_ROLE
} = process.env

// ---------- MONGO FIX (NO HANG) ----------
let client
let db

async function getDB() {
  if (!global._mongoClient) {
    const newClient = new MongoClient(NightBot_MONGODB_URI)
    await newClient.connect()
    global._mongoClient = newClient
    console.log("✅ Mongo Connected")
  }

  client = global._mongoClient
  db = client.db("system")
  return db
}

// ---------- DISCORD HELPERS ----------
const followUp = async (interaction, content) => {
  try {
    const res = await fetch(
      `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      }
    )
    console.log("FollowUp:", res.status)
  } catch (err) {
    console.error("FollowUp ERROR:", err)
  }
}

// ---------- MAIN COMMAND ----------
async function handleCommand(interaction) {
  console.log("⚡ COMMAND RECEIVED")

  try {
    const db = await getDB()

    const Borrow = db.collection("borrowed")
    const Users = db.collection("users")

    const user = interaction.member?.user?.id
    const cmd = interaction.data.name

    console.log("CMD:", cmd)

    // -------- BASIC COMMANDS --------

    if (cmd === "request") {
      const item = interaction.data.options?.[0]?.value || "unknown"

      await Borrow.insertOne({
        user,
        item,
        time: new Date()
      })

      return await followUp(interaction, `✅ request sent for ${item}`)
    }

    if (cmd === "borrowers") {
      const list = await Borrow.find().toArray()

      if (!list.length) {
        return await followUp(interaction, "no borrowers")
      }

      const text = list.map(b => `<@${b.user}> → ${b.item}`).join("\n")
      return await followUp(interaction, text)
    }

    if (cmd === "cancel") {
      await Borrow.deleteMany({ user })
      return await followUp(interaction, "cancelled ✅")
    }

    // fallback
    return await followUp(interaction, "working ✅")
  } catch (err) {
    console.error("🔥 COMMAND ERROR:", err)
    return await followUp(interaction, "error happened ❌")
  }
}

// ---------- HANDLER ----------
export default async function handler(req, res) {
  try {
    const signature = req.headers["x-signature-ed25519"]
    const timestamp = req.headers["x-signature-timestamp"]
    const body = JSON.stringify(req.body)

    const isValid = verifyKey(body, signature, timestamp, PUBLIC_KEY)
    console.log("VERIFY:", isValid)

    if (!isValid) {
      return res.status(401).send("invalid request")
    }

    const interaction = req.body

    // ping
    if (interaction.type === 1) {
      return res.json({ type: 1 })
    }

    // commands
    if (interaction.type === 2) {
      // respond instantly
      res.json({ type: 5 })

      // run async
      handleCommand(interaction)

      return
    }

    // buttons
    if (interaction.type === 3) {
      return res.json({ type: 6 })
    }

  } catch (err) {
    console.error("🔥 HANDLER ERROR:", err)
    return res.status(500).send("server error")
  }
}
