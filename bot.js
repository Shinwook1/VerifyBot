const { Client, GatewayIntentBits, Collection, SlashCommandBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // ✅ 추가 (중요)
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

function saveUserRoles(map) {
  try {
    fs.writeFileSync(ROLES_FILE, JSON.stringify([...map.entries()], null, 2));
  } catch (error) {
    console.error('역할 데이터 저장 실패:', error);
  }
}

function loadAuthCount() {
  try {
    if (fs.existsSync(COUNT_FILE)) {
      return parseInt(fs.readFileSync(COUNT_FILE, 'utf-8'), 10);
    }
  } catch (error) {
    console.error('카운트 로드 실패:', error);
  }
  return 0;
}

function saveAuthCount(count) {
  try {
    fs.writeFileSync(COUNT_FILE, count.toString());
  } catch (error) {
    console.error('카운트 저장 실패:', error);
  }
}

/* ---------------- 명령어 ---------------- */

const commands = [
  new SlashCommandBuilder()
    .setName('역할설정')
    .setDescription('인증 시 받을 역할 설정')
    .addRoleOption(opt =>
      opt.setName('역할').setDescription('역할 선택').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('상태')
    .setDescription('현재 설정된 역할 확인'),

  new SlashCommandBuilder()
    .setName('패널')
    .setDescription('인증 패널 생성'),

  new SlashCommandBuilder()
    .setName('역할삭제')
    .setDescription('역할 설정 삭제'),
];

async function deployCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.DISCORD_CLIENT_ID,
      process.env.DISCORD_GUILD_ID
    ),
    { body: commands.map(c => c.toJSON()) }
  );
}

/* ---------------- 준비 ---------------- */

client.once('ready', async () => {
  console.log(`✅ 로그인 완료: ${client.user.tag}`);
  await deployCommands();

  client.userRoles = loadUserRoles();
  client.authCount = loadAuthCount();

  client.userRoles.forEach((_, id) => {
    client.verifiedUsers.set(id, true);
  });
});

/* ---------------- 인터랙션 ---------------- */

client.on('interactionCreate', async (interaction) => {
  try {

    /* ❗ 서버 체크 (핵심) */
    if (!interaction.guild) {
      return interaction.reply({
        content: '❌ 서버에서만 사용 가능합니다.',
        ephemeral: true,
      });
    }

    /* ---------------- 슬래시 ---------------- */
    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === '역할설정') {
        const role = interaction.options.getRole('역할');

        client.userRoles.set(interaction.user.id, role.id);
        saveUserRoles(client.userRoles);

        return interaction.reply({
          content: `✅ ${role.name} 역할로 설정됨`,
          ephemeral: true,
        });
      }

      if (interaction.commandName === '상태') {
        const roleId = client.userRoles.get(interaction.user.id);

        if (!roleId) {
          return interaction.reply({
            content: '❌ 역할 없음',
            ephemeral: true,
          });
        }

        const role = interaction.guild.roles.cache.get(roleId);

        return interaction.reply({
          content: `✅ 현재 역할: ${role ? role.name : '없음'}`,
          ephemeral: true,
        });
      }

      if (interaction.commandName === '역할삭제') {
        client.userRoles.delete(interaction.user.id);
        client.verifiedUsers.delete(interaction.user.id);
        saveUserRoles(client.userRoles);

        return interaction.reply({
          content: '✅ 삭제 완료',
          ephemeral: true,
        });
      }

      if (interaction.commandName === '패널') {
        return interaction.reply({
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: '## ⚡ 인증 시스템\n버튼을 눌러 인증하세요',
                },
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 2,
                      label: '인증',
                      custom_id: 'auth',
                    },
                  ],
                },
                {
                  type: 10,
                  content: `현재 인증: ${client.authCount}명`,
                },
              ],
            },
          ],
        });
      }
    }

    /* ---------------- 버튼 ---------------- */
    if (interaction.isButton()) {

      if (interaction.customId === 'auth') {

        if (!interaction.member) {
          return interaction.reply({
            content: '❌ 멤버 정보 없음',
            ephemeral: true,
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const roleId = client.userRoles.get(interaction.user.id);

        if (!roleId) {
          return interaction.editReply('❌ 역할 먼저 설정');
        }

        const role = interaction.guild.roles.cache.get(roleId);

        if (!role) {
          return interaction.editReply('❌ 역할 없음');
        }

        if (interaction.member.roles.cache.has(role.id)) {
          return interaction.editReply('이미 있음');
        }

        try {
          await interaction.member.roles.add(role);
        } catch (err) {
          console.error(err);
          return interaction.editReply('❌ 권한 문제 (봇 역할 위치 확인)');
        }

        if (!client.verifiedUsers.has(interaction.user.id)) {
          client.verifiedUsers.set(interaction.user.id, true);
          client.authCount++;
          saveAuthCount(client.authCount);
        }

        return interaction.editReply(`✅ ${role.name} 지급 완료`);
      }
    }

  } catch (err) {
    console.error(err);

    if (!interaction.replied) {
      interaction.reply({
        content: '❌ 오류 발생',
        ephemeral: true,
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
