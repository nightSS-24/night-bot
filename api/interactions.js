import { verifyKey } from "discord-interactions"
import { MongoClient } from "mongodb"

const {
  PUBLIC_KEY,
  BOT_TOKEN,
  CATEGORY_ID,
  LOG_CHANNEL,
  MONGO_URI,
  COMMUNITY_ROLE,
  HELPER_ROLE
} = process.env

const MONGO_URI = process.env.MONGODB_URI;

let client;
let db;

if (!global._mongo) {
  client = new MongoClient(MONGO_URI);
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

const queue = []
let processing = false
const userLocks = new Map()

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
  return fetch(
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
  if (now - data.last > SPAM_WINDOW) {
    data.count = 0
  }
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

const restricted = [
  "accept",
  "decline",
  "ban-user",
  "timeout",
  "trusted",
  "search",
  "reminder"
]

function formatTime(ms) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m`
}

function isPriority(cmd) {
  return ["accept", "decline", "given", "timeout"].includes(cmd)
}

async function processQueue() {
  if (processing) return
  processing = true

  while (queue.length > 0) {
    const job = queue.shift()

    const locked = userLocks.get(job.user)
    if (locked && Date.now() < locked) continue

    userLocks.set(job.user, Date.now() + 2000)

    try {
      await handleCommand(job.interaction)
    } catch {}

    await new Promise(r => setTimeout(r, 300))
  }

  processing = false
}

async function handleCommand(interaction) {
  const user = interaction.member?.user?.id
  const cmd = interaction.data.name

  const banned = await Banned.findOne({ user })
  if (banned) {
    await followUp(interaction, "access denied")
    return
  }

  if (restricted.includes(cmd) && !checkAccess(interaction.member)) {
    await followUp(interaction, "not allowed")
    return
  }

  const cd = checkCooldown(user, cmd)
  if (cd > 0) {
    await followUp(interaction, `wait ${cd}s`)
    return
  }

  const spam = trackSpam(user)
  if (spam > SPAM_LIMIT) {
    await Users.updateOne({ user }, { $inc: { violations: 1, trust: -15 } })
    await api(`/guilds/${interaction.guild_id}/members/${user}`, "PATCH", {
      communication_disabled_until: new Date(Date.now() + 10 * 60000)
    })
    await followUp(interaction, "restricted for spam")
    return
  }

  if (cmd === "request") {
    const data = await getUser(user)
    if (data.trust < 20) {
      await followUp(interaction, "access restricted")
      return
    }

    const item = interaction.data.options[0].value
    await log({ user, action: "request", item })

    await followUp(interaction, `request ${item}`, {
      components: [{
        type: 1,
        components: [
          { type: 2, label: "Accept", style: 3, custom_id: `accept_${user}_${item}` },
          { type: 2, label: "Decline", style: 4, custom_id: `decline_${user}_${item}` }
        ]
      }]
    })
    return
  }

  if (cmd === "given") {
    const session = await Session.findOne({ channel: interaction.channel_id })
    if (!session) {
      await followUp(interaction, "invalid")
      return
    }

    if (session.type === "request") {
      const now = Date.now()
      const due = now + BORROW_DURATION

      await Borrow.insertOne({
        user: session.user,
        item: session.item,
        helper: session.helper,
        borrowedAt: now,
        dueAt: due
      })

      await Users.updateOne({ user: session.user }, { $inc: { totalBorrowed: 1 } })
      await log({ user: session.user, action: "borrow", item: session.item })

      await followUp(interaction, "completed")
      return
    }

    if (session.type === "return") {
      const info = await Borrow.findOne({ user: session.user })
      const now = Date.now()
      const late = now > info.dueAt

      await Borrow.deleteOne({ user: session.user })

      if (late) {
        await Users.updateOne(
          { user: session.user },
          { $inc: { lateReturns: 1, trust: -10 } }
        )
      } else {
        await Users.updateOne(
          { user: session.user },
          { $inc: { returnedOnTime: 1, trust: 5 } }
        )
      }

      await log({
        user: session.user,
        action: late ? "late_return" : "return",
        item: session.item
      })

      await api(`/channels/${interaction.channel_id}`, "DELETE")

      await followUp(interaction, late ? "returned late" : "returned")
      return
    }
  }

  if (cmd === "reminder") {
    const target = interaction.data.options[0].value
    const info = await Borrow.findOne({ user: target })

    if (!info) {
      await followUp(interaction, "none")
      return
    }

    const remaining = info.dueAt - Date.now()

    if (remaining <= 0) {
      await followUp(interaction, `<@${target}> overdue return ${info.item}`)
      return
    }

    await followUp(
      interaction,
      `<@${target}> return ${info.item}\ntime left ${formatTime(remaining)}`
    )
    return
  }

  if (cmd === "borrowers") {
    const list = await Borrow.find().toArray()
    if (!list.length) {
      await followUp(interaction, "none")
      return
    }

    const text = list.map(b => {
      const left = b.dueAt - Date.now()
      return `<@${b.user}> ${b.item} (${left > 0 ? formatTime(left) : "late"})`
    }).join("\n")

    await followUp(interaction, text)
    return
  }

  if (cmd === "return") {
    const info = await Borrow.findOne({ user })
    if (!info) {
      await followUp(interaction, "none")
      return
    }

    await followUp(interaction, `return ${info.item}`, {
      components: [{
        type: 1,
        components: [{
          type: 2,
          label: "Claim",
          style: 1,
          custom_id: `claim_${user}`
        }]
      }]
    })
    return
  }

  if (cmd === "cancel") {
    await Session.deleteMany({ user })
    await followUp(interaction, "cancelled")
    return
  }

  if (cmd === "ban-user") {
    const target = interaction.data.options[0].value
    await Banned.insertOne({ user: target })
    await followUp(interaction, "banned")
    return
  }

  if (cmd === "search") {
    const target = interaction.data.options[0].value
    const info = await Borrow.findOne({ user: target })
    await followUp(interaction, info ? `has ${info.item}` : "none")
    return
  }

  if (cmd === "timeout") {
    const target = interaction.data.options[0].value
    const duration = interaction.data.options[1].value
    await api(`/guilds/${interaction.guild_id}/members/${target}`, "PATCH", {
      communication_disabled_until: new Date(Date.now() + duration * 60000)
    })
    await followUp(interaction, "timeout")
    return
  }

  if (cmd === "trusted") {
    const target = interaction.data.options[0].value
    await Users.updateOne({ user: target }, { $set: { trust: 90 } })
    await followUp(interaction, "trusted")
    return
  }

  if (cmd === "questions") {
    await followUp(interaction, "contact staff")
    return
  }

  if (cmd === "accept") {
    const target = interaction.data.options[0].value
    const item = interaction.data.options[1].value

    const channel = await createChannel(
      interaction.guild_id,
      `ticket-${nextTicket()}`,
      target,
      user
    )

    await Session.insertOne({
      channel: channel.id,
      user: target,
      helper: user,
      item,
      type: "request"
    })

    await followUp(interaction, `accepted <#${channel.id}>`)
    return
  }

  if (cmd === "decline") {
    const target = interaction.data.options[0].value
    await Session.deleteMany({ user: target })
    await followUp(interaction, "declined")
    return
  }
}

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
    res.json({ type: 5 })

    const user = interaction.member?.user?.id

    if (isPriority(interaction.data.name)) {
      queue.unshift({ interaction, user })
    } else {
      queue.push({ interaction, user })
    }

    processQueue()
    return
  }

  if (interaction.type === 3) {
    const [action, ...args] = interaction.data.custom_id.split("_")
    const helper = interaction.member.user.id

    if (action === "accept") {
      const [userId, item] = args

      const channel = await createChannel(
        interaction.guild_id,
        `ticket-${nextTicket()}`,
        userId,
        helper
      )

      await Session.insertOne({
        channel: channel.id,
        user: userId,
        helper,
        item,
        type: "request"
      })

      return res.json(update(`accepted <#${channel.id}>`, { components: [] }))
    }

    if (action === "claim") {
      const userId = args[0]
      const info = await Borrow.findOne({ user: userId })

      const channel = await createChannel(
        interaction.guild_id,
        `return-${nextTicket()}`,
        userId,
        helper
      )

      await Session.insertOne({
        channel: channel.id,
        user: userId,
        helper,
        item: info.item,
        type: "return"
      })

      return res.json(update(`created <#${channel.id}>`, { components: [] }))
    }
  }
}
