const { Client, GatewayIntentBits, Collection, SlashCommandBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

client.commands = new Collection();
client.userRoles = new Map();
client.authCount = 0;
client.verifiedUsers = new Map();


const DATA_DIR = path.join(__dirname, 'data');
const ROLES_FILE = path.join(DATA_DIR, 'user_roles.json');
const COUNT_FILE = path.join(DATA_DIR, 'auth_count.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

function loadUserRoles() {
  try {
    if (fs.existsSync(ROLES_FILE)) {
      const data = fs.readFileSync(ROLES_FILE, 'utf-8');
      return new Map(JSON.parse(data));
    }
  } catch (error) {
    console.error('역할 데이터 로드 실패:', error);
  }
  return new Map();
}

function saveUserRoles(userRolesMap) {
  try {
    const data = JSON.stringify([...userRolesMap.entries()], null, 2);
    fs.writeFileSync(ROLES_FILE, data, 'utf-8');
  } catch (error) {
    console.error('역할 데이터 저장 실패:', error);
  }
}

function loadAuthCount() {
  try {
    if (fs.existsSync(COUNT_FILE)) {
      const data = fs.readFileSync(COUNT_FILE, 'utf-8');
      return parseInt(data, 10);
    }
  } catch (error) {
    console.error('인증 카운트 로드 실패:', error);
  }
  return 0;
}

function saveAuthCount(count) {
  try {
    fs.writeFileSync(COUNT_FILE, count.toString(), 'utf-8');
  } catch (error) {
    console.error('인증 카운트 저장 실패:', error);
  }
}

const commands = [

  new SlashCommandBuilder()
    .setName('역할설정')
    .setDescription('인증 시 받을 역할을 설정합니다')
    .addRoleOption(option =>
      option
        .setName('역할')
        .setDescription('설정할 역할을 선택하세요')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('상태')
    .setDescription('현재 설정된 인증 역할을 확인합니다'),

  new SlashCommandBuilder()
    .setName('패널')
    .setDescription('인증 패널을 표시합니다 (Components V2)'),

  new SlashCommandBuilder()
    .setName('역할삭제')
    .setDescription('설정된 인증 역할을 삭제합니다'),
];

async function deployCommands() {
  try {
    console.log('Slash Commands 등록 중...');

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const commandData = commands.map(cmd => cmd.toJSON());

    const data = await rest.put(
      Routes.applicationGuildCommands(
        process.env.DISCORD_CLIENT_ID,
        process.env.DISCORD_GUILD_ID
      ),
      { body: commandData }
    );

  } catch (error) {
    console.error('명령어 등록 실패:', error);
  }
}

client.once('clientReady', async () => {
  console.log(`✅ 봇 로그인 완료: ${client.user.tag}`);
  await deployCommands();

  client.userRoles.clear();
  client.verifiedUsers.clear();
  client.userRoles = loadUserRoles();
  client.authCount = loadAuthCount();
  
  client.userRoles.forEach((_roleId, userId) => {
    client.verifiedUsers.set(userId, true);
  });
});

client.on('interactionCreate', async (interaction) => {
  
  if (interaction.isCommand()) {
    const commandName = interaction.commandName;

    try {
      if (commandName === '역할설정') {
        const selectedRole = interaction.options.getRole('역할');
        client.userRoles.set(interaction.user.id, selectedRole.id);
        saveUserRoles(client.userRoles);

        await interaction.reply({
          content: `✅ **${selectedRole.name}** 역할로 설정되었습니다!`,
          flags: 64,
        });
      }

      else if (commandName === '상태') {
        const userRoleId = client.userRoles.get(interaction.user.id);

        if (!userRoleId) {
          return await interaction.reply({
            content: '❌ 설정된 역할이 없습니다. `/역할설정` 명령어로 먼저 역할을 설정해주세요.',
            flags: 64,
          });
        }

        const role = interaction.guild.roles.cache.get(userRoleId);

        if (!role) {
          return await interaction.reply({
            content: '❌ 설정된 역할을 찾을 수 없습니다.',
            flags: 64,
          });
        }

        await interaction.reply({
          content: `✅ 현재 설정된 인증 역할: **${role.name}**`,
          flags: 64,
        });
      }

      else if (commandName === '패널') {
    
        client.userRoles = loadUserRoles();
        client.authCount = loadAuthCount();

        await interaction.reply({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: '### ⚡️ Volt 인증봇\n아래에 버튼을 눌러서 인증해주세요',
                },
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 2,
                      label: '⚡️ 인증',
                      custom_id: 'auth_verify',
                    },
                  ],
                },
                {
                  type: 14,
                },
                {
                  type: 10,
                  content: `현재 인증 사람 수: **${client.authCount}명**`,
                },
              ],
            },
          ],
          flags: 32768,
        });
      }

      else if (commandName === '역할삭제') {
        const userRoleId = client.userRoles.get(interaction.user.id);

        if (!userRoleId) {
          return await interaction.reply({
            content: '❌ 설정된 역할이 없습니다.',
            flags: 64,
          });
        }

        client.userRoles.delete(interaction.user.id);
        client.verifiedUsers.delete(interaction.user.id);
        saveUserRoles(client.userRoles);

        await interaction.reply({
          content: '✅ 설정된 인증 역할이 삭제되었습니다.',
          flags: 64,
        });
      }
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: '명령어 실행 중 에러가 발생했습니다.', flags: 64 });
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'auth_verify') {
      
      await interaction.deferReply({ flags: 64 });

      const userRole = client.userRoles.get(interaction.user.id);

      if (!userRole) {
        return await interaction.editReply({
          content: '❌ 먼저 `/역할설정` 명령어로 역할을 설정해주세요.',
        });
      }

      try {
        const role = interaction.guild.roles.cache.get(userRole);
        if (!role) {
          return await interaction.editReply({
            content: '❌ 설정된 역할을 찾을 수 없습니다.',
          });
        }

        if (interaction.member.roles.cache.has(userRole)) {
          return await interaction.editReply({
            content: `✅ 이미 \`${role.name}\` 역할을 가지고 있습니다!`,
          });
        }

        if (client.verifiedUsers.has(interaction.user.id)) {
          client.verifiedUsers.delete(interaction.user.id);
        }

        await interaction.member.roles.add(role);

        if (!client.verifiedUsers.has(interaction.user.id)) {
          client.verifiedUsers.set(interaction.user.id, true);
          client.authCount++;
          saveAuthCount(client.authCount);
          
          try {
            await interaction.message.edit({
              components: [
                {
                  type: 17,
                  components: [
                    {
                      type: 10,
                      content: '# ⚡️ Volt 인증봇\n아래에 버튼을 눌러서 인증해주세요',
                    },
                    {
                      type: 1,
                      components: [
                        {
                          type: 2,
                          style: 2,
                          label: '⚡️ 인증',
                          custom_id: 'auth_verify',
                        },
                      ],
                    },
                    {
                      type: 14,
                    },
                    {
                      type: 10,
                      content: `현재 인증 사람 수: **${client.authCount}명**`,
                    },
                  ],
                },
              ],
              flags: 32768,
            });
          } catch (error) {
            console.error('패널 메시지 업데이트 실패:', error);
          }
        }
        
        await interaction.editReply({
          content: `✅ 인증 완료! \`${role.name}\` 역할이 부여되었습니다.`,
        });
      } catch (error) {
        console.error(error);
        await interaction.editReply({
          content: '❌ 역할 부여 중 에러가 발생했습니다.',
        });
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
