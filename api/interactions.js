import { verifyKey } from "discord-interactions"

const PUBLIC_KEY = process.env.PUBLIC_KEY
const HELPER_ROLE = "1481673722682150996"
const LEGACY_ROLE = "1480479375328673812"

let borrowed = {}

export default async function handler(req, res) {

 const signature = req.headers["x-signature-ed25519"]
 const timestamp = req.headers["x-signature-timestamp"]
 const body = JSON.stringify(req.body)

 const valid = verifyKey(body, signature, timestamp, PUBLIC_KEY)

 if (!valid) {
  return res.status(401).send("invalid request")
 }

 const interaction = req.body

 if (interaction.type === 1) {
  return res.json({ type: 1 })
 }

 if (interaction.type === 2) {

  const name = interaction.data.name

  if (name === "request") {

   const item = interaction.data.options[0].value
   const user = interaction.member.user.id

   return res.json({
    type: 4,
    data: {
     content: `<@&${HELPER_ROLE}> request from <@${user}> for **${item}**`,
     components: [
      {
       type: 1,
       components: [
        {
         type: 2,
         label: "Accept",
         style: 3,
         custom_id: `accept_${user}_${item}`
        },
        {
         type: 2,
         label: "Decline",
         style: 4,
         custom_id: `decline_${user}_${item}`
        }
       ]
      }
     ]
    }
   })
  }

  if (name === "borrowers") {

   if (Object.keys(borrowed).length === 0) {
    return res.json({
     type: 4,
     data: { content: "no active borrowers" }
    })
   }

   let list = ""

   for (const user in borrowed) {
    list += `<@${user}> borrowed **${borrowed[user]}**\n`
   }

   return res.json({
    type: 4,
    data: { content: list }
   })
  }

  if (name === "giverole") {

   const member = interaction.data.options[0].value
   const guild = interaction.guild_id

   await fetch(`https://discord.com/api/v10/guilds/${guild}/members/${member}/roles/${LEGACY_ROLE}`, {
    method: "PUT",
    headers: {
     Authorization: `Bot ${process.env.BOT_TOKEN}`
    }
   })

   return res.json({
    type: 4,
    data: { content: "role given" }
   })
  }
 }

 if (interaction.type === 3) {

  const id = interaction.data.custom_id

  if (id.startsWith("accept_")) {

   const parts = id.split("_")
   const user = parts[1]
   const item = parts[2]

   borrowed[user] = item

   return res.json({
    type: 7,
    data: {
     content: `<@${user}> borrowed **${item}**`,
     components: []
    }
   })
  }

  if (id.startsWith("decline_")) {

   const parts = id.split("_")
   const user = parts[1]

   return res.json({
    type: 7,
    data: {
     content: `request from <@${user}> declined`,
     components: []
    }
   })
  }
 }
}
