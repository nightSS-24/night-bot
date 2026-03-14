import { verifyKey } from "discord-interactions"

const PUBLIC_KEY = process.env.PUBLIC_KEY
const BOT_TOKEN = process.env.BOT_TOKEN

const HELPER_ROLE = "1481673722682150996"
const LEGACY_ROLE = "1480479375328673812"

let borrowed = {}
let sessions = {}

async function discord(url, method, body) {
 return fetch(`https://discord.com/api/v10${url}`, {
  method,
  headers: {
   Authorization: `Bot ${BOT_TOKEN}`,
   "Content-Type": "application/json"
  },
  body: body ? JSON.stringify(body) : undefined
 })
}

export default async function handler(req, res) {

 const signature = req.headers["x-signature-ed25519"]
 const timestamp = req.headers["x-signature-timestamp"]
 const body = JSON.stringify(req.body)

 if (!verifyKey(body, signature, timestamp, PUBLIC_KEY)) {
  return res.status(401).send("bad signature")
 }

 const interaction = req.body

 if (interaction.type === 1) {
  return res.json({ type: 1 })
 }

 if (interaction.type === 2) {

  const cmd = interaction.data.name
  const user = interaction.member.user.id
  const guild = interaction.guild_id

  if (cmd === "request") {

   const item = interaction.data.options[0].value

   return res.json({
    type: 4,
    data: {
     content: `<@&${HELPER_ROLE}> request from <@${user}> for **${item}**`,
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
    return res.json({ type: 4, data: { content: "no borrowers" } })
   }

   let text = ""

   for (const u in borrowed) {
    text += `<@${u}> → ${borrowed[u].item}\n`
   }

   return res.json({ type: 4, data: { content: text } })
  }

  if (cmd === "given") {

   const channel = interaction.channel_id
   const session = sessions[channel]

   if (!session) {
    return res.json({ type: 4, data: { content: "invalid channel" } })
   }

   borrowed[session.user] = {
    item: session.item,
    helper: session.helper
   }

   session.locked = true

   return res.json({
    type: 4,
    data: { content: `item **${session.item}** given to <@${session.user}>` }
   })
  }

  if (cmd === "decline") {

   const channel = interaction.channel_id
   const session = sessions[channel]

   if (!session) {
    return res.json({ type: 4, data: { content: "invalid session" } })
   }

   await discord(`/users/@me/channels`, "POST", { recipient_id: session.user })

   await discord(`/channels/${channel}`, "DELETE")

   return res.json({ type: 4, data: { content: "request declined" } })
  }

  if (cmd === "return") {

   const item = interaction.data.options[0].value
   const info = borrowed[user]

   if (!info || info.item !== item) {
    return res.json({ type: 4, data: { content: "not borrowed" } })
   }

   return res.json({
    type: 4,
    data: { content: "return request sent to helper" }
   })
  }
 }

 if (interaction.type === 3) {

  const id = interaction.data.custom_id
  const guild = interaction.guild_id
  const helper = interaction.member.user.id

  if (id.startsWith("accept_")) {

   const parts = id.split("_")
   const user = parts[1]
   const item = parts[2]

   const channel = await discord(`/guilds/${guild}/channels`, "POST", {
    name: `borrow-${user}`,
    type: 0,
    permission_overwrites: [
     { id: guild, deny: "1024" },
     { id: user, allow: "1024" },
     { id: HELPER_ROLE, allow: "1024" }
    ]
   }).then(r => r.json())

   sessions[channel.id] = {
    user,
    item,
    helper,
    messages: 0,
    locked: false
   }

   return res.json({
    type: 7,
    data: { content: `channel created <#${channel.id}>`, components: [] }
   })
  }

  if (id.startsWith("decline_")) {

   const user = id.split("_")[1]

   return res.json({
    type: 7,
    data: { content: `request from <@${user}> declined`, components: [] }
   })
  }
 }
}
