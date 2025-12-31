import chalk from 'chalk';
import figlet from 'figlet';
import { promisify } from 'util';

const terminalWidth = process.stdout.columns;
const maxWidth = Math.min(terminalWidth, 50);

const config = {
  whatsapp: true,
  telegram: false
};

(async () => {
  try {
    if (config.whatsapp) {
      console.log(chalk.green.bold('\n🎁  Menjalankan Vynaa Valerie Bot WhatsApp'));
      const { default: startWhatsApp } = await import('./WhatsApp/index.js');
      startWhatsApp();
    } else {
      console.log(chalk.red.bold('\n❌  Bot WhatsApp Dinonaktifkan Di VynaaSet.js'));
    }

    if (config.telegram) {
      console.log(chalk.green.bold('\n🎁  Menjalankan Vynaa Valerie Bot'));
      const { default: startTelegram } = await import('./Telegram/index.js');
      startTelegram();
    } else {
      console.log(chalk.red.bold('\nmade by @VynaaValerie\nwa.me/6282389924037\n'));
    }

    const asyncFiglet = promisify(figlet.text);
    const logo = await asyncFiglet('Vynaa', {
      font: 'ANSI Shadow',
      horizontalLayout: 'default',
      verticalLayout: 'default',
      width: maxWidth,
      whitespaceBreak: false
    });

    console.log(chalk.blue.bold(logo));

    console.log(chalk.white.bold(`${chalk.green.bold("📃  Informasi :")}         
✉️  Script Vynaa Valerie Versi 2.2
✉️  Author : VynaaValerie
🎁  Base : VynaaValerie

${chalk.green.bold("🎁  Bot Started :D")}\n`));

  } catch (err) {
    console.error(chalk.red.bold('\n⚠️  Terjadi Kesalahan : ' + err.message + '\n'));
  }
})();
