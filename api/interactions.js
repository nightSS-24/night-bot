import { verifyKey } from "discord-interactions"

const PUBLIC_KEY = process.env.PUBLIC_KEY
const BOT_TOKEN = process.env.BOT_TOKEN

const CATEGORY_ID = "1482618433274249356"
const LOG_CHANNEL = "1482618594260029490"
const HELPER_ROLE = "1482454128029601954"

let borrowed = {}
let sessions = {}
let ticket = 0

async function api(url, method, body) {
 return fetch(`https://discord.com/api/v10${url}`, {
  method,
  headers: {
   Authorization: `Bot ${BOT_TOKEN}`,
   "Content-Type": "application/json"
  },
  body: body ? JSON.stringify(body) : undefined
 })
}

function nextTicket() {
 ticket++
 return String(ticket).padStart(4, "0")
}

async function log(text) {
 await api(`/channels/${LOG_CHANNEL}/messages`, "POST", { content: text })
}

export default async function handler(req, res) {

 const signature = req.headers["x-signature-ed25519"]
 const timestamp = req.headers["x-signature-timestamp"]
 const body = JSON.stringify(req.body)

 if (!verifyKey(body, signature, timestamp, PUBLIC_KEY)) {
  return res.status(401).send("invalid signature")
 }

 const interaction = req.body

 if (interaction.type === 1) {
  return res.json({ type: 1 })
 }

 if (interaction.type === 2) {

  const cmd = interaction.data.name
  const user = interaction.member.user.id
  const username = interaction.member.user.username
  const guild = interaction.guild_id
  const channel = interaction.channel_id

  if (cmd === "request") {

   const item = interaction.data.options[0].value

   return res.json({
    type: 4,
    data: {
     content: `<@${user}> requested **${item}**`,
     components: [{
      type: 1,
      components: [
       { type: 2, label: "Accept", style: 3, custom_id: `accept_${user}_${item}` },
       { type: 2, label: "Decline", style: 4, custom_id: `decline_${user}_${item}` }
      ]
     }]
    }
   })
  }

  if (cmd === "borrowers") {

   if (!Object.keys(borrowed).length) {
    return res.json({ type: 4, data: { content: "no active borrowers" } })
   }

   let text = ""

   for (const u in borrowed) {
    const b = borrowed[u]
    text += `<@${u}> → **${b.item}** (helper <@${b.helper}>)\n`
   }

   return res.json({ type: 4, data: { content: text } })
  }

  if (cmd === "given") {

   const session = sessions[channel]

   if (!session) {
    return res.json({ type: 4, data: { content: "not a session channel" } })
   }

   if (session.type === "request") {

    borrowed[session.user] = {
     item: session.item,
     helper: session.helper
    }

    await api(`/channels/${channel}`, "PATCH", {
     permission_overwrites: [
      { id: session.user, deny: "2048" }
     ]
    })

    await log(`@${session.user} borrowed **${session.item}** from <@${session.helper}>`)

    return res.json({
     type: 4,
     data: { content: "item marked as given • channel locked" }
    })
   }

   if (session.type === "return") {

    delete borrowed[session.user]

    await log(`@${session.user} returned **${session.item}** to <@${session.helper}>`)

    await api(`/channels/${channel}`, "DELETE")

    return res.json({
     type: 4,
     data: { content: "return completed" }
    })
   }
  }

  if (cmd === "decline") {

   const session = sessions[channel]

   if (!session) {
    return res.json({ type: 4, data: { content: "not a session channel" } })
   }

   await log(`<@${session.helper}> declined **${session.item}** for <@${session.user}>`)

   await api(`/channels/${channel}`, "DELETE")

   return res.json({
    type: 4,
    data: { content: "request declined" }
   })
  }

  if (cmd === "return") {

   const info = borrowed[user]

   if (!info) {
    return res.json({ type: 4, data: { content: "nothing borrowed" } })
   }

   return res.json({
    type: 4,
    data: {
     content: `return request for **${info.item}**`,
     components: [{
      type: 1,
      components: [{
       type: 2,
       label: "Claim",
       style: 1,
       custom_id: `claim_${user}`
      }]
     }]
    }
   })
  }
 }

 if (interaction.type === 3) {

  const id = interaction.data.custom_id
  const helper = interaction.member.user.id
  const helperName = interaction.member.user.username
  const guild = interaction.guild_id

  if (id.startsWith("accept_")) {

   const [_, user, item] = id.split("_")

   if (Object.values(sessions).find(s => s.user === user && s.item === item)) {
    return res.json({
     type: 4,
     data: { content: "already accepted", flags: 64 }
    })
   }

   const number = nextTicket()
   const name = `${interaction.member.user.username}-${number}`

   const channel = await api(`/guilds/${guild}/channels`, "POST", {
    name,
    parent_id: CATEGORY_ID,
    type: 0,
    permission_overwrites: [
     { id: guild, deny: "1024" },
     { id: user, allow: "1024" },
     { id: helper, allow: "1024" }
    ]
   }).then(r => r.json())

   sessions[channel.id] = {
    user,
    helper,
    item,
    channel: channel.id,
    type: "request",
    messages: 0
   }

   await log(`<@${helper}> accepted **${item}** request from <@${user}>`)

   return res.json({
    type: 7,
    data: {
     content: `accepted by <@${helper}> • channel <#${channel.id}>`,
     components: []
    }
   })
  }

  if (id.startsWith("claim_")) {

   const user = id.split("_")[1]
   const info = borrowed[user]

   const helper = interaction.member.user.id

   if (helper !== info.helper) {
    return res.json({
     type: 4,
     data: { content: "only original helper can claim", flags: 64 }
    })
   }

   const number = nextTicket()
   const name = `return-${number}`

   const channel = await api(`/guilds/${interaction.guild_id}/channels`, "POST", {
    name,
    parent_id: CATEGORY_ID,
    type: 0,
    permission_overwrites: [
     { id: interaction.guild_id, deny: "1024" },
     { id: user, allow: "1024" },
     { id: helper, allow: "1024" }
    ]
   }).then(r => r.json())

   sessions[channel.id] = {
    user,
    helper,
    item: info.item,
    channel: channel.id,
    type: "return",
    messages: 0
   }

   await log(`<@${helper}> claimed return of **${info.item}** from <@${user}>`)

   return res.json({
    type: 7,
    data: {
     content: `return channel created <#${channel.id}>`,
     components: []
    }
   })
  }
 }
}
