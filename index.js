const { Client, GatewayIntentBits, REST, Routes, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const configPath = path.join(__dirname, 'config.json');

function loadConfig() {
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
        return { verifyRoleId: null };
    }
}
function saveConfig(config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}
let config = loadConfig();

// ===== Component V2 빌더 (수정 완료) =====
const COMPONENT_TYPE = { Container: 17, Section: 9, TextDisplay: 10, Button: 2, ActionRow: 1 };
const BUTTON_STYLE = { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 };
const IS_COMPONENTS_V2 = 32768;

function textDisplay(content) {
    return { type: COMPONENT_TYPE.TextDisplay, content: content.slice(0, 4000) };
}

function section(contents, accessory = null) {
    // contents는 배열이어야 하고, 1~3개로 제한
    const items = (Array.isArray(contents) ? contents : [contents]).slice(0, 3);
    const components = items.map(c => textDisplay(c));
    const out = { type: COMPONENT_TYPE.Section, components };
    
    if (accessory) {
        if (accessory.url) {
            out.accessory = { type: 11, media: { url: accessory.url } };
        } else if (accessory.custom_id) {
            out.accessory = {
                type: COMPONENT_TYPE.Button,
                style: accessory.style || BUTTON_STYLE.Secondary,
                custom_id: accessory.custom_id,
                label: (accessory.label || '').slice(0, 80)
            };
            if (accessory.emoji) out.accessory.emoji = accessory.emoji;
        }
    } else {
        // accessory가 없으면 더미 accessory 추가 (빈 버튼)
        out.accessory = {
            type: COMPONENT_TYPE.Button,
            style: BUTTON_STYLE.Secondary,
            custom_id: 'dummy_btn',
            label: ' '
        };
    }
    return out;
}

function actionRow(buttons) {
    return {
        type: COMPONENT_TYPE.ActionRow,
        components: buttons.map(b => ({
            type: COMPONENT_TYPE.Button,
            style: b.style || BUTTON_STYLE.Secondary,
            custom_id: b.custom_id,
            label: (b.label || '').slice(0, 80),
            ...(b.emoji && { emoji: b.emoji })
        }))
    };
}

function container(children, accentColor) {
    const out = { type: COMPONENT_TYPE.Container, components: children };
    if (accentColor !== undefined) out.accent_color = accentColor;
    return out;
}

function buildPanel() {
    // 각 섹션의 텍스트를 1~3개로 제한
    const intro = section(['# ⚡ Volt Service 인증봇', '아래 버튼을 눌러서 인증해주세요.']);
    const btnRow = actionRow([{ custom_id: 'verify_btn', label: '✅ 인증하기', style: BUTTON_STYLE.Success }]);
    const info = section(['**📌 안내**', '- 인증 버튼 클릭 시 역할이 지급됩니다.']);
    const box = container([intro, btnRow, info], 0x00ff00);
    return { components: [box], flags: IS_COMPONENTS_V2 };
}

// ===== 봇 이벤트 =====
client.once('clientReady', async () => {
    console.log(`✅ 로그인: ${client.user.tag}`);
    
    const rest = new REST({ version: '10' }).setToken(client.token);
    const commands = [
        { name: '패널', description: '인증 패널을 표시합니다.' },
        { name: '역할설정', description: '인증 시 지급할 역할을 설정합니다.', options: [{ name: '역할', type: 8, description: '지급할 역할', required: true }] },
        { name: '상태', description: '현재 설정된 역할을 확인합니다.' }
    ];
    
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ 슬래시 커맨드 등록됨');
    } catch (e) {
        console.error('❌ 커맨드 등록 실패:', e);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isCommand()) {
        if (interaction.commandName === '패널') {
            await interaction.reply(buildPanel());
        }
        else if (interaction.commandName === '역할설정') {
            if (!interaction.memberPermissions.has('Administrator')) {
                return await interaction.reply({ content: '❌ 관리자만 가능합니다.', flags: 64 });
            }
            const role = interaction.options.getRole('역할');
            config.verifyRoleId = role.id;
            saveConfig(config);
            await interaction.reply({ content: `✅ 인증 역할이 ${role}로 설정됨`, flags: 64 });
        }
        else if (interaction.commandName === '상태') {
            const role = config.verifyRoleId ? `<@&${config.verifyRoleId}>` : '미설정';
            await interaction.reply({ content: `📌 현재 인증 역할: ${role}`, flags: 64 });
        }
    }
    
    else if (interaction.isButton() && interaction.customId === 'verify_btn') {
        if (!config.verifyRoleId) {
            return await interaction.reply({ content: '❌ 인증 역할이 설정되지 않았습니다.', flags: 64 });
        }
        const role = interaction.guild.roles.cache.get(config.verifyRoleId);
        if (!role) {
            return await interaction.reply({ content: '❌ 역할을 찾을 수 없습니다.', flags: 64 });
        }
        try {
            await interaction.member.roles.add(role);
            await interaction.reply({ content: `✅ 인증 완료! ${role} 역할이 지급됨`, flags: 64 });
        } catch {
            await interaction.reply({ content: '❌ 역할 지급 실패 (권한 부족)', flags: 64 });
        }
    }
});

const token = process.env.TOKEN;
if (!token) {
    console.error('❌ TOKEN 환경 변수 없음');
    process.exit(1);
}
client.login(token);
