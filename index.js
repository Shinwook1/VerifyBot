const { Client, GatewayIntentBits, REST, Routes, ComponentType, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const configPath = path.join(__dirname, 'config.json');

// ===== 설정 로드/저장 =====
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

// ===== Component V2 빌더 =====
const COMPONENT_TYPE = {
    Container: 17,
    Section: 9,
    TextDisplay: 10,
    Button: 2,
    ActionRow: 1,
};

const BUTTON_STYLE = {
    Primary: 1,
    Secondary: 2,
    Success: 3,
    Danger: 4,
    Link: 5,
};

const IS_COMPONENTS_V2 = 32768;

function textDisplay(content) {
    return { type: COMPONENT_TYPE.TextDisplay, content: content.slice(0, 4000) };
}

function section(contents, accessory = null) {
    const components = (Array.isArray(contents) ? contents : [contents]).map(c => textDisplay(c));
    if (!accessory) return components;
    
    if (accessory.url) {
        return {
            type: COMPONENT_TYPE.Section,
            components,
            accessory: { type: 11, media: { url: accessory.url } }
        };
    }
    
    return {
        type: COMPONENT_TYPE.Section,
        components,
        accessory: {
            type: COMPONENT_TYPE.Button,
            style: accessory.style || BUTTON_STYLE.Secondary,
            custom_id: accessory.custom_id,
            label: accessory.label?.slice(0, 80) || '',
            emoji: accessory.emoji
        }
    };
}

function button(btn) {
    const b = {
        type: COMPONENT_TYPE.Button,
        style: btn.style || BUTTON_STYLE.Secondary,
        label: btn.label?.slice(0, 80) || ''
    };
    if (btn.custom_id) b.custom_id = btn.custom_id;
    if (btn.url) b.url = btn.url;
    if (btn.emoji) b.emoji = btn.emoji;
    return b;
}

function actionRow(buttons) {
    return { type: COMPONENT_TYPE.ActionRow, components: buttons.map(b => button(b)) };
}

function container(children, accentColor) {
    const out = { type: COMPONENT_TYPE.Container, components: children };
    if (accentColor) out.accent_color = accentColor;
    return out;
}

function buildVerifyPanel() {
    const intro = section([
        '# ⚡ Volt Service 인증봇',
        '',
        '아래 버튼을 눌러서 인증해주세요.',
        '',
        '_인증 후 서비스 이용이 가능합니다._'
    ]);
    
    const btnRow = actionRow([
        { custom_id: 'verify_btn', label: '✅ 인증하기', style: BUTTON_STYLE.Success }
    ]);
    
    const info = section([
        '**📌 안내**',
        '- 인증 버튼 클릭 시 자동으로 역할이 지급됩니다.',
        '- 문의사항은 관리자에게 문의하세요.'
    ]);
    
    const box = container([intro, btnRow, info], 0x00ff00);
    
    return {
        components: [box],
        flags: IS_COMPONENTS_V2
    };
}

// ===== 봇 준비 =====
client.once('ready', async () => {
    console.log(`✅ 로그인: ${client.user.tag}`);
    
    // 슬래시 커맨드 등록
    const rest = new REST({ version: '10' }).setToken(client.token);
    const commands = [
        {
            name: '패널',
            description: '인증 패널을 표시합니다.'
        },
        {
            name: '역할설정',
            description: '인증 시 지급할 역할을 설정합니다.',
            options: [
                {
                    name: '역할',
                    description: '지급할 역할',
                    type: 8,
                    required: true
                }
            ]
        },
        {
            name: '상태',
            description: '현재 설정된 역할을 확인합니다.'
        }
    ];
    
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ 슬래시 커맨드 등록됨');
    } catch (e) {
        console.error('❌ 커맨드 등록 실패:', e);
    }
});

// ===== 슬래시 커맨드 =====
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;
    
    if (interaction.commandName === '패널') {
        await interaction.reply(buildVerifyPanel());
    }
    
    else if (interaction.commandName === '역할설정') {
        if (!interaction.memberPermissions.has('Administrator')) {
            return await interaction.reply({ content: '❌ 관리자만 사용 가능합니다.', ephemeral: true });
        }
        
        const role = interaction.options.getRole('역할');
        config.verifyRoleId = role.id;
        saveConfig(config);
        
        await interaction.reply({ content: `✅ 인증 역할이 ${role}로 설정되었습니다.`, ephemeral: true });
    }
    
    else if (interaction.commandName === '상태') {
        const role = config.verifyRoleId ? `<@&${config.verifyRoleId}>` : '설정되지 않음';
        await interaction.reply({ content: `📌 현재 인증 역할: ${role}`, ephemeral: true });
    }
});

// ===== 버튼 콜백 =====
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId === 'verify_btn') {
        if (!config.verifyRoleId) {
            return await interaction.reply({ content: '❌ 관리자가 아직 인증 역할을 설정하지 않았습니다.', ephemeral: true });
        }
        
        const role = interaction.guild.roles.cache.get(config.verifyRoleId);
        if (!role) {
            return await interaction.reply({ content: '❌ 설정된 역할을 찾을 수 없습니다.', ephemeral: true });
        }
        
        try {
            await interaction.member.roles.add(role);
            await interaction.reply({ content: `✅ 인증 완료! ${role} 역할이 지급되었습니다.`, ephemeral: true });
        } catch (e) {
            await interaction.reply({ content: '❌ 역할을 지급할 수 없습니다. (권한 부족)', ephemeral: true });
        }
    }
});

client.login('');
