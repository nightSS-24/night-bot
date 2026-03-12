import { verifyKey } from 'discord-interactions'
import fetch from 'node-fetch'

const PUBLIC_KEY = process.env.PUBLIC_KEY
const BOT_TOKEN = process.env.BOT_TOKEN
const HELPER_ROLE = "1481673722682150996"
const LEGACY_ROLE = "1480479375328673812"

let borrowed = {}

export default async function handler(req, res) {
  const signature = req.headers['x-signature-ed25519']
  const timestamp = req.headers['x-signature-timestamp']
  const body = JSON.stringify(req.body)

  const isValid = verifyKey(body, signature, timestamp, PUBLIC_KEY)
  if (!isValid) return res.status(401).send('Bad request')

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
          content: `<@&${HELPER_ROLE}> Request from <@${user}> for **${item}**`,
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

    if (name === "giverole") {
      const member = interaction.data.options[0].value
      const guild = interaction.guild_id

      await fetch(`https://discord.com/api/v10/guilds/${guild}/members/${member}/roles/${LEGACY_ROLE}`, {
        method: "PUT",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`
        }
      })

      return res.json({
        type: 4,
        data: { content: "Role given" }
      })
    }
  }

  if (interaction.type === 3) {
    const id = interaction.data.custom_id
    const guild = interaction.guild_id

    if (id.startsWith("accept_")) {
      const [_, user, item] = id.split("_")
      borrowed[user] = item

      return res.json({
        type: 7,
        data: {
          content: `Accepted. <@${user}> borrowed **${item}**`
        }
      })
    }

    if (id.startsWith("decline_")) {
      const [_, user] = id.split("_")

      return res.json({
        type: 7,
        data: {
          content: `Request from <@${user}> declined`
        }
      })
    }
  }
}
