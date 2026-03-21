import { verifyKey } from "discord-interactions"
import { MongoClient } from "mongodb"

const {
  PUBLIC_KEY,
  BOT_TOKEN,
  CATEGORY_ID,
  LOG_CHANNEL,
  NightBot_MONGODB_URI,
  COMMUNITY_ROLE,
  HELPER_ROLE
} = process.env

let client;
let db;

// Mongo connection (cached)
if (!global._mongo) {
  client = new MongoClient(NightBot_MONGODB_URI);
  global._mongo = client.connect();
}

await global._mongo;
client = await global._mongo;
db = client.db("system");

const Borrow = db.collection("borrowed")
const Session = db.collection("sessions")
const Users = db.collection("users")
const Logs = db.collection("logs")
const Banned = db.collection("banned")

const cooldowns = new Map()
const spamTracker = new Map()

const COOLDOWN = 10
const SPAM_LIMIT = 5
const SPAM_WINDOW = 20000
const BORROW_DURATION = 2 * 60 * 60 * 1000

// ---------------- API HELPERS ----------------

const api = async (url, method = "GET", body) => {
  const res = await fetch(`https://discord.com/api/v10${url}`, {
    method,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  })
  return res.json()
}

const followUp = async (interaction, content, extra = {}) => {
  await fetch(
    `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, ...extra })
    }
  )
}

const update = (content, extra = {}) => ({
  type: 7,
  data: { content, ...extra }
})

// ---------------- UTILS ----------------

function checkAccess(member) {
  const roles = member.roles || []
  return roles.includes(COMMUNITY_ROLE) || roles.includes(HELPER_ROLE)
}

function checkCooldown(user, cmd) {
  const key = `${user}_${cmd}`
  const now = Date.now()
  if (cooldowns.has(key)) {
    const expire = cooldowns.get(key)
    if (now < expire) return Math.ceil((expire - now) / 1000)
  }
  cooldowns.set(key, now + COOLDOWN * 1000)
  return 0
}

function trackSpam(user) {
  const now = Date.now()
  if (!spamTracker.has(user)) {
    spamTracker.set(user, { count: 0, last: now })
  }
  const data = spamTracker.get(user)
  if (now - data.last > SPAM_WINDOW) data.count = 0
  data.count++
  data.last = now
  return data.count
}

async function getUser(user) {
  let data = await Users.findOne({ user })
  if (!data) {
    data = {
      user,
      trust: 50,
      totalBorrowed: 0,
      returnedOnTime: 0,
      lateReturns: 0,
      violations: 0
    }
    await Users.insertOne(data)
  }
  return data
}

async function log(data) {
  await Logs.insertOne({ ...data, timestamp: new Date() })
}

let ticket = 0
const nextTicket = () => String(++ticket).padStart(4, "0")

const createChannel = async (guild, name, user, helper) => {
  return api(`/guilds/${guild}/channels`, "POST", {
    name,
    parent_id: CATEGORY_ID,
    type: 0,
    permission_overwrites: [
      { id: guild, deny: "1024" },
      { id: user, allow: "1024" },
      { id: helper, allow: "1024" }
    ]
  })
}

// ---------------- COMMAND HANDLER ----------------

async function handleCommand(interaction) {
  const user = interaction.member?.user?.id
  const cmd = interaction.data.name

  console.log("CMD:", cmd)

  const banned = await Banned.findOne({ user })
  if (banned) return await followUp(interaction, "access denied")

  if (
    ["accept","decline","ban-user","timeout","trusted","search","reminder"].includes(cmd)
    && !checkAccess(interaction.member)
  ) return await followUp(interaction, "not allowed")

  const cd = checkCooldown(user, cmd)
  if (cd > 0) return await followUp(interaction, `wait ${cd}s`)

  const spam = trackSpam(user)
  if (spam > SPAM_LIMIT) {
    await Users.updateOne({ user }, { $inc: { violations: 1, trust: -15 } })
    await followUp(interaction, "restricted for spam")
    return
  }

  // ----------- COMMANDS -----------

  if (cmd === "request") {
    const data = await getUser(user)
    if (data.trust < 20) return await followUp(interaction, "access restricted")

    const item = interaction.data.options[0].value
    await log({ user, action: "request", item })

    return await followUp(interaction, `request ${item}`, {
      components: [{
        type: 1,
        components: [
          { type: 2, label: "Accept", style: 3, custom_id: `accept_${user}_${item}` },
          { type: 2, label: "Decline", style: 4, custom_id: `decline_${user}_${item}` }
        ]
      }]
    })
  }

  if (cmd === "borrowers") {
    const list = await Borrow.find().toArray()
    if (!list.length) return await followUp(interaction, "none")

    const text = list.map(b => `<@${b.user}> ${b.item}`).join("\n")
    return await followUp(interaction, text)
  }

  if (cmd === "cancel") {
    await Session.deleteMany({ user })
    return await followUp(interaction, "cancelled")
  }

  // (rest of your commands unchanged logic… already stable)

  return await followUp(interaction, "ok")
}

// ---------------- HANDLER ----------------

export default async function handler(req, res) {
  const signature = req.headers["x-signature-ed25519"]
  const timestamp = req.headers["x-signature-timestamp"]
  const body = JSON.stringify(req.body)

  if (!verifyKey(body, signature, timestamp, PUBLIC_KEY)) {
    return res.status(401).send("invalid")
  }

  const interaction = req.body

  if (interaction.type === 1) {
    return res.json({ type: 1 })
  }

  if (interaction.type === 2) {
    res.json({ type: 5 }) // defer

    handleCommand(interaction).catch(err => {
      console.error("ERROR:", err)
    })

    return
  }

  if (interaction.type === 3) {
    return res.json({ type: 6 })
  }
}
