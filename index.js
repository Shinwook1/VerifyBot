const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    REST, 
    Routes,
    PermissionFlagsBits
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // 역할 부여를 위해 필수
    ]
});

// 환경 변수에서 토큰 가져오기
const TOKEN = process.env.TOKEN;
let authRoleId = null; // 실제 운영 시에는 DB나 JSON 파일에 저장하세요.

client.once('ready', () => {
    console.log(`${client.user.tag}으로 로그인되었습니다!`);
    
    // 슬래시 커맨드 등록
    const commands = [
        {
            name: '역할설정',
            description: '인증 시 부여할 역할을 설정합니다.',
            options: [{
                name: 'role',
                type: 8, // ROLE 타입
                description: '지급할 역할 선택',
                required: true
            }]
        },
        {
            name: '상태',
            description: '현재 설정된 역할을 확인합니다.'
        },
        {
            name: '패널',
            description: '인증 패널을 생성합니다.'
        }
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    (async () => {
        try {
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
            console.log('슬래시 커맨드 동기화 완료');
        } catch (error) {
            console.error(error);
        }
    })();
});

client.on('interactionCreate', async (interaction) => {
    // 1. 슬래시 커맨드 처리
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === '역할설정') {
            const role = interaction.options.getRole('role');
            authRoleId = role.id;
            await interaction.reply({ content: `✅ 인증 역할이 ${role.name}으로 설정되었습니다.`, ephemeral: true });
        }

        if (interaction.commandName === '상태') {
            const roleName = authRoleId ? interaction.guild.roles.cache.get(authRoleId)?.name : "없음";
            await interaction.reply({ content: `🔍 현재 설정된 역할: **${roleName || '찾을 수 없음'}**`, ephemeral: true });
        }

        if (interaction.commandName === '패널') {
            const embed = new EmbedBuilder()
                .setTitle('Volt Auto Partner Bot')
                .setDescription('최고의 효율을 자랑하는 디스코드 자동 홍보 시스템에 오신 것을 환영합니다.\n아래 버튼을 통해 라이선스를 인증하고 당신의 홍보를 자동화하세요.')
                .setColor(0x2b2d31)
                // .setImage('이미지_URL_입력') // 스크린샷의 중앙 이미지가 있다면 여기에 URL 입력
                .addFields(
                    { 
                        name: '⚠️ 주의', 
                        value: '본계정 토큰으로 사용하시면 정지 위험이 있으니 **부계로 사용하시는 것을 추천**합니다.\n저희 볼트 서비스는 본계정 사용으로 인한 정지는 책임지지 않습니다.',
                        inline: false 
                    },
                    { 
                        name: '\u200B', 
                        value: '🟢 **현재 사용가능** — 서비스가 정상적으로 가동 중입니다.', 
                        inline: false 
                    }
                )
                .setFooter({ text: 'Volt Service' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify_btn')
                        .setLabel('라이선스 인증하기')
                        .setStyle(ButtonStyle.Secondary), // 스크린샷과 유사한 회색 버튼
                    new ButtonBuilder()
                        .setCustomId('extract_btn')
                        .setLabel('내 토큰 추출하기')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
    }

    // 2. 버튼 클릭 처리 (컴포넌트 V2)
    if (interaction.isButton()) {
        if (interaction.customId === 'verify_btn') {
            if (!authRoleId) {
                return await interaction.reply({ content: '❌ 설정된 인증 역할이 없습니다.', ephemeral: true });
            }

            const role = interaction.guild.roles.cache.get(authRoleId);
            if (interaction.member.roles.cache.has(authRoleId)) {
                return await interaction.reply({ content: '✅ 이미 인증된 사용자입니다.', ephemeral: true });
            }

            try {
                await interaction.member.roles.add(role);
                await interaction.reply({ content: `🎊 인증 완료! **${role.name}** 역할이 부여되었습니다.`, ephemeral: true });
            } catch (err) {
                await interaction.reply({ content: '❌ 역할을 부여할 권한이 없습니다. 봇의 역할 순위를 확인하세요.', ephemeral: true });
            }
        }
        
        if (interaction.customId === 'extract_btn') {
            await interaction.reply({ content: '토큰 추출 기능을 준비 중입니다.', ephemeral: true });
        }
    }
});

client.login(TOKEN);
