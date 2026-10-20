/*
 * CH32V203C8U6 OTA bootloader - lives in the first 8 KB of flash.
 *
 * The application (the CH32V203C8U project) is linked at APP_BASE (0x2000).
 * On reset this bootloader either starts the application or stays in update
 * mode, where a new application image is received over USART1 (PA9 = TX,
 * PA10 = RX) from the Bluetooth module and written to flash.
 *
 * Update mode is entered when:
 *   - the app asked for it ("ota" command: app writes BKP_DR1 = OTA_MAGIC and
 *     resets), or
 *   - the reset button is pressed 3 times quickly (safe mode, see
 *     SAFE_WINDOW_MS), or
 *   - there is no valid application (e.g. an update was interrupted).
 *
 * Protocol (app -> board), little-endian:
 *   A5 5A | cmd u8 | len u16 | payload[len] | crc32 u32 (over cmd..payload)
 *   0x01 START {u32 size, u32 crc32}  -> "OK,START"
 *   0x02 DATA  {u16 seq, data[1..256]} -> "OK,<seq>"   (block seq at offset seq*256)
 *   0x03 END                           -> "DONE", then reset into the new app
 *   0x04 RUN                           -> "OK,RUN", reset into the app
 *   0x05 INFO                          -> the BOOT line
 * Replies are text ending in '\' (the app's line delimiter), e.g. "OK,7\".
 * Errors: ERR,FRAME / ERR,STATE / ERR,SIZE / ERR,LEN / ERR,SEQ,<expected> /
 * ERR,BASE / ERR,FLASH / ERR,CRC / ERR,NOAPP / ERR,CMD.
 * While waiting, "BOOT,<version>,<baud>,<max size>\" is sent every second.
 *
 * Image page 0 is erased on START and written last (after the whole-image
 * CRC matched on END), so an interrupted update never leaves a half-written
 * application that looks valid: the board just stays here and the update can
 * be retried.
 *
 * LED (WS2812 ring of 24 on PB3): dim blue = waiting, a white arc turns round the
 * ring while receiving (at the brightness the app last sent, BKP_DR4), green = done,
 * red = error.
 *
 * No interrupts are used except the software interrupt that jumps to the app.
 */
#include "ch32v20x.h"
#include <string.h>

#define BL_VERSION     "1.0"

#define APP_BASE       0x2000                      /* app link/run address */
#define APP_FLASH      (FLASH_BASE + APP_BASE)     /* same, as the flash controller sees it */
#define APP_MAX        (56u * 1024)                /* 64 KB flash - 8 KB bootloader */
#define PAGE           256u                        /* fast erase/program page */
#define ERASED_WORD    0xE339E339u                 /* how erased flash reads on CH32 */

/* Backup registers shared with the app (keep in sync with the app's main.c).
 * They survive resets, so the app can hand over a request and the baud rate. */
#define BKP_REQ        BKP_DR1                     /* OTA_MAGIC = "stay in bootloader" */
#define BKP_BAUD       BKP_DR2                     /* UART baud / 100 */
#define BKP_RESETS     BKP_DR3                     /* quick-reset counter (safe mode) */
#define BKP_BRIGHT     BKP_DR4                     /* last brightness the app sent (0-255) */
#define OTA_MAGIC      0xB007

#define SAFE_RESETS    3                           /* resets within the window -> safe mode */
#define SAFE_WINDOW_MS 500

#define TICKS_PER_US   72u                         /* SysTick at the 72 MHz core clock */
#define TICKS_PER_MS   72000u

#define STR_(x)        #x
#define STR(x)         STR_(x)

/* free-running SysTick counter, polled */
static inline uint32_t now(void)
{
    return *(volatile uint32_t *)&SysTick->CNT;
}

static void delay_ms(uint32_t ms)
{
    uint32_t t = now();
    while ((uint32_t)(now() - t) < ms * TICKS_PER_MS);
}

/* ------------------------------------------------------- jump to app --- */
/* Same approach as WCH's IAP example: jump from inside a software interrupt,
 * so the app's startup code ends the interrupt with its own "mret". */
void SW_Handler(void) __attribute__((interrupt("WCH-Interrupt-fast")));
void SW_Handler(void)
{
    __asm volatile("li  a6, " STR(APP_BASE) "\n\t"
                   "jr  a6");
    while (1);
}

static int app_valid(void)
{
    const volatile uint32_t *app = (const volatile uint32_t *)APP_BASE;

    /* word 0 is "j handle_reset"; word 1 is the vector table's _start entry,
     * which equals the link address only for an image built for this slot */
    return app[0] != ERASED_WORD && app[1] == APP_BASE;
}

static void jump_to_app(void)
{
    SysTick->CTLR = 0;
    NVIC_EnableIRQ(Software_IRQn);
    NVIC_SetPendingIRQ(Software_IRQn);
    while (1);
}

/* ------------------------------------------------------------ WS2812 --- */
#define T_PERIOD     90              /* 1.25 us, timings as in the app */
#define T_0H         22
#define T_1H         50
#define WS_HIGH()    (GPIOB->BSHR = GPIO_Pin_3)
#define WS_LOW()     (GPIOB->BCR  = GPIO_Pin_3)
#define DIM          0x10
#define RING         24                 /* WS2812s on the ring */
#define ARC          8                  /* lit pixels in the receiving arc */
#define SPIN_MS      60                 /* one step of the arc, ms (24 steps a turn) */

static uint8_t spin_pos;                /* head of the receiving arc, 0..RING-1 */
static uint32_t spin_t;                 /* when the arc last stepped */

static void ws_init(void)
{
    GPIO_InitTypeDef g = {0};

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);
    g.GPIO_Pin   = GPIO_Pin_3;
    g.GPIO_Mode  = GPIO_Mode_Out_PP;
    g.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB, &g);
    WS_LOW();
}

static void ws_send_byte(uint8_t v)
{
    for (int i = 7; i >= 0; i--) {
        uint32_t t0 = now();
        uint32_t th = (v & (1 << i)) ? T_1H : T_0H;
        WS_HIGH();
        while ((uint32_t)(now() - t0) < th);
        WS_LOW();
        while ((uint32_t)(now() - t0) < T_PERIOD);
    }
}

static void ws_set(uint8_t r, uint8_t g, uint8_t b)
{
    ws_send_byte(g);                 /* WS2812 order is GRB */
    ws_send_byte(r);
    ws_send_byte(b);
    WS_LOW();
    uint32_t t0 = now();
    while ((uint32_t)(now() - t0) < 100 * TICKS_PER_US);   /* >80 us reset */
}

/* The whole ring, one colour per pixel (GRB, pixel 0 first). */
static void ws_frame(const uint8_t px[RING][3])
{
    for (int i = 0; i < RING; i++) {
        ws_send_byte(px[i][1]);
        ws_send_byte(px[i][0]);
        ws_send_byte(px[i][2]);
    }
    WS_LOW();
    uint32_t t0 = now();
    while ((uint32_t)(now() - t0) < 100 * TICKS_PER_US);   /* >80 us reset */
}

/* One step of the receiving arc: ARC white pixels, the rest dark, at the last
 * brightness the app sent (BKP_DR4); 0 or unset falls back to a dim level. */
static void spin_step(void)
{
    uint16_t bright = BKP_ReadBackupRegister(BKP_BRIGHT) & 0xFF;
    uint8_t  v = bright ? (uint8_t)bright : 0x40;
    uint8_t  px[RING][3];

    for (int p = 0; p < RING; p++) {
        uint8_t behind = (uint8_t)((spin_pos + RING - p) % RING);
        uint8_t on = behind < ARC ? v : 0;
        px[p][0] = px[p][1] = px[p][2] = on;     /* white */
    }
    ws_frame((const uint8_t (*)[3])px);
    spin_pos = (uint8_t)((spin_pos + 1) % RING);
}

/* ------------------------------------------------------------ serial --- */
static uint32_t cur_baud;

static void usart_init(uint32_t baud)
{
    GPIO_InitTypeDef  g = {0};
    USART_InitTypeDef u = {0};

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA | RCC_APB2Periph_USART1, ENABLE);

    g.GPIO_Pin   = GPIO_Pin_9;                 /* TX */
    g.GPIO_Mode  = GPIO_Mode_AF_PP;
    g.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &g);

    g.GPIO_Pin  = GPIO_Pin_10;                 /* RX */
    g.GPIO_Mode = GPIO_Mode_IPU;
    GPIO_Init(GPIOA, &g);

    USART_Cmd(USART1, DISABLE);
    u.USART_BaudRate            = baud;
    u.USART_WordLength          = USART_WordLength_8b;
    u.USART_StopBits            = USART_StopBits_1;
    u.USART_Parity              = USART_Parity_No;
    u.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    u.USART_Mode                = USART_Mode_Rx | USART_Mode_Tx;
    USART_Init(USART1, &u);
    USART_Cmd(USART1, ENABLE);

    cur_baud = baud;
}

/* Blocking TX is fine here: the app only sends after it got our reply. */
static void tx_byte(uint8_t b)
{
    while (!(USART1->STATR & USART_FLAG_TXE));
    USART1->DATAR = b;
}

static void tx_str(const char *s) { while (*s) tx_byte((uint8_t)*s++); }

static void tx_num(uint32_t n)
{
    char buf[11];
    int i = 0;
    do { buf[i++] = (char)('0' + n % 10); n /= 10; } while (n);
    while (i) tx_byte((uint8_t)buf[--i]);
}

static void tx_end(void) { tx_byte('\\'); }      /* the app's line delimiter */

static void tx_drain(void)
{
    while (!(USART1->STATR & USART_FLAG_TC));
}

static void send_boot_line(void)
{
    tx_str("BOOT," BL_VERSION ",");
    tx_num(cur_baud);
    tx_byte(',');
    tx_num(APP_MAX);
    tx_end();
}

/* ------------------------------------------------------ baud detection --- */
/* Same pulse-width detector as the app: the shortest pulse between two edges
 * on PA10 in a burst is one bit time. Only used when the app didn't hand over
 * its baud rate (safe mode after a power cycle, no valid app). */
static struct {
    uint8_t  level, edge_ok;
    uint32_t last_sample, last_edge, min_pulse;
    uint16_t edges, good, errors;
} ab = { .level = 1, .min_pulse = 0xFFFFFFFF };

static uint32_t baud_from_bit(uint32_t ticks)
{
    uint32_t us = ticks / TICKS_PER_US;
    if (us < 12) return 115200;
    if (us < 21) return 57600;
    if (us < 36) return 38400;
    if (us < 72) return 19200;
    return 9600;
}

/* Returns a new baud rate to switch to, or 0. */
static uint32_t ab_poll(void)
{
    uint32_t t    = now();
    uint8_t  lvl  = (GPIOA->INDR & GPIO_Pin_10) ? 1 : 0;
    uint8_t  late = (uint32_t)(t - ab.last_sample) > 5 * TICKS_PER_US;
    ab.last_sample = t;

    if (lvl != ab.level) {
        if (ab.edges && ab.edge_ok && !late) {
            uint32_t w = t - ab.last_edge;
            if (w < ab.min_pulse) ab.min_pulse = w;
        }
        ab.level     = lvl;
        ab.last_edge = t;
        ab.edge_ok   = !late;
        ab.edges++;
        return 0;
    }

    if (ab.edges && lvl && (uint32_t)(t - ab.last_edge) > 20 * TICKS_PER_MS) {
        uint32_t nb = 0;
        if (ab.edges >= 4 && ab.min_pulse != 0xFFFFFFFF && (ab.errors || !ab.good)) {
            nb = baud_from_bit(ab.min_pulse);
            if (nb == cur_baud) nb = 0;
        }
        ab.edges = ab.good = ab.errors = 0;
        ab.min_pulse = 0xFFFFFFFF;
        return nb;
    }
    return 0;
}

/* ------------------------------------------------------------- flash --- */
/* CRC-32 (IEEE 802.3, reflected) - identical to java.util.zip.CRC32. */
static uint32_t crc32_update(uint32_t crc, const uint8_t *p, uint32_t n)
{
    while (n--) {
        crc ^= *p++;
        for (int k = 0; k < 8; k++)
            crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
    }
    return crc;
}

static void flash_erase_page(uint32_t addr)
{
    if (addr < APP_FLASH) return;              /* never touch the bootloader */
    FLASH_Unlock_Fast();
    FLASH_ErasePage_Fast(addr);
    FLASH_Lock_Fast();
    FLASH_Lock();
}

/* Erase + program one 256-byte page, then read it back. Returns 1 if OK. */
static int flash_write_page(uint32_t addr, const uint32_t *buf)
{
    if (addr < APP_FLASH) return 0;
    FLASH_Unlock_Fast();
    FLASH_ErasePage_Fast(addr);
    FLASH_ProgramPage_Fast(addr, (uint32_t *)buf);
    FLASH_Lock_Fast();
    FLASH_Lock();
    return memcmp((const void *)addr, buf, PAGE) == 0;
}

/* ----------------------------------------------------------- updater --- */
#define MAX_PAYLOAD  (2 + PAGE)
#define FRAME_MAX    (3 + MAX_PAYLOAD + 4)         /* cmd, len, payload, crc */

static uint8_t  frame[FRAME_MAX];
static uint16_t frame_pos, frame_need;
static uint8_t  sync;                              /* sync bytes seen (0..2) */

static uint32_t page_buf[PAGE / 4];
static uint32_t page0[PAGE / 4];                   /* image page 0, written last */
static uint8_t  started;
static uint32_t img_size, img_crc;
static uint16_t expected;                          /* next DATA block number */

static uint32_t rd32(const uint8_t *p)
{
    return (uint32_t)p[0] | (uint32_t)p[1] << 8 | (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24;
}

static uint16_t rd16(const uint8_t *p) { return (uint16_t)(p[0] | p[1] << 8); }

static void reply(const char *s)               { tx_str(s); tx_end(); }
static void reply_n(const char *s, uint32_t n) { tx_str(s); tx_num(n); tx_end(); }

static void fail(const char *s)
{
    reply(s);
    ws_set(DIM * 2, 0, 0);                         /* red */
}

static void reboot(void)
{
    tx_drain();
    delay_ms(20);
    BKP_WriteBackupRegister(BKP_RESETS, 0);
    NVIC_SystemReset();
}

static void cmd_start(const uint8_t *p, uint16_t len)
{
    if (len != 8) { fail("ERR,LEN"); return; }
    uint32_t size = rd32(p);
    if (size < 8 || size > APP_MAX) { fail("ERR,SIZE"); return; }

    flash_erase_page(APP_FLASH);                   /* old app is now invalid */
    img_size = size;
    img_crc  = rd32(p + 4);
    expected = 0;
    started  = 1;
    reply("OK,START");
    spin_t = now();
}

static void cmd_data(const uint8_t *p, uint16_t len)
{
    if (!started)  { fail("ERR,STATE"); return; }
    if (len < 3)   { fail("ERR,LEN");   return; }

    uint16_t seq = rd16(p);
    uint16_t n   = (uint16_t)(len - 2);

    if (seq + 1 == expected) { reply_n("OK,", seq); return; }   /* resent block */
    if (seq != expected)     { reply_n("ERR,SEQ,", expected); return; }

    uint32_t off  = (uint32_t)seq * PAGE;
    uint32_t want = img_size - off;
    if (off >= img_size || n != (want < PAGE ? want : PAGE)) { fail("ERR,LEN"); return; }

    memset(page_buf, 0xFF, PAGE);
    memcpy(page_buf, p + 2, n);

    if (seq == 0) {
        if (page_buf[1] != APP_BASE) { started = 0; fail("ERR,BASE"); return; }
        memcpy(page0, page_buf, PAGE);             /* programmed on END */
    } else if (!flash_write_page(APP_FLASH + off, page_buf)) {
        started = 0;
        fail("ERR,FLASH");
        return;
    }

    expected++;
    reply_n("OK,", seq);
}

static void cmd_end(void)
{
    if (!started || (uint32_t)expected * PAGE < img_size) { fail("ERR,STATE"); return; }

    uint32_t first = img_size < PAGE ? img_size : PAGE;
    uint32_t crc = crc32_update(0xFFFFFFFFu, (const uint8_t *)page0, first);
    crc = crc32_update(crc, (const uint8_t *)(APP_FLASH + PAGE), img_size - first);
    crc = ~crc;
    started = 0;

    if (crc != img_crc)                      { fail("ERR,CRC");   return; }
    if (!flash_write_page(APP_FLASH, page0)) { fail("ERR,FLASH"); return; }

    reply("DONE");
    ws_set(0, DIM * 2, 0);                         /* green */
    reboot();                                      /* boots the new app */
}

static void handle_frame(void)
{
    uint8_t  cmd = frame[0];
    uint16_t len = rd16(frame + 1);
    const uint8_t *payload = frame + 3;

    uint32_t crc = ~crc32_update(0xFFFFFFFFu, frame, 3u + len);
    if (crc != rd32(payload + len)) { reply("ERR,FRAME"); return; }

    switch (cmd) {
    case 0x01: cmd_start(payload, len); break;
    case 0x02: cmd_data(payload, len);  break;
    case 0x03: cmd_end();               break;
    case 0x04:
        if (!app_valid()) { fail("ERR,NOAPP"); break; }
        reply("OK,RUN");
        reboot();
        break;
    case 0x05: send_boot_line();        break;
    default:   reply("ERR,CMD");        break;
    }
}

/* Feed one received byte to the frame parser. Returns 1 when a frame was
 * handled. */
static int parse_byte(uint8_t b)
{
    if (sync < 2) {                                /* hunt for A5 5A */
        if (b == 0xA5)                   sync = 1;
        else if (sync == 1 && b == 0x5A) { sync = 2; frame_pos = 0; frame_need = 3; }
        else                             sync = 0;
        return 0;
    }

    frame[frame_pos++] = b;
    if (frame_pos == 3) {                          /* header done: cmd + len */
        uint16_t len = rd16(frame + 1);
        if (len > MAX_PAYLOAD) { sync = 0; reply("ERR,FRAME"); return 0; }
        frame_need = (uint16_t)(3 + len + 4);
    }
    if (frame_pos < frame_need) return 0;

    sync = 0;
    handle_frame();
    return 1;
}

#define ANNOUNCE_AFTER_S  3          /* send the BOOT line each second after this much quiet */
#define IDLE_EXIT_S       120        /* nothing at all for this long: start the app (if valid) */

static void update_mode(void)
{
    uint16_t saved = BKP_ReadBackupRegister(BKP_BAUD);
    uint32_t baud  = (saved >= 96 && saved <= 1152) ? saved * 100u : 9600;
    uint32_t sec_mark;
    uint16_t quiet_s = ANNOUNCE_AFTER_S;           /* whole seconds without a frame */
    uint16_t idle_s  = 0;                          /* whole seconds without any byte */

    ws_init();
    ws_set(0, 0, DIM);                             /* dim blue: waiting */
    usart_init(baud);
    send_boot_line();
    sec_mark = now();

    while (1) {
        uint32_t t = now();

        if (started && (uint32_t)(t - spin_t) >= SPIN_MS * TICKS_PER_MS) {
            spin_t = t;
            spin_step();                           /* receiving: the arc turns */
        }

        uint32_t nb = ab_poll();
        if (nb) {
            usart_init(nb);
            BKP_WriteBackupRegister(BKP_BAUD, (uint16_t)(nb / 100));
            sync = 0;
            send_boot_line();
            continue;
        }

        /* once a second (counted in seconds, so the 59 s tick wrap doesn't matter) */
        if ((uint32_t)(t - sec_mark) >= 1000 * TICKS_PER_MS) {
            sec_mark += 1000 * TICKS_PER_MS;
            if (quiet_s < 0xFFFF) quiet_s++;
            if (idle_s  < 0xFFFF) idle_s++;

            if (quiet_s >= ANNOUNCE_AFTER_S)
                send_boot_line();                  /* let the app find us */
            if (sync && idle_s >= 2)
                sync = 0;                          /* drop a frame stalled for 1-2 s */
            if (idle_s >= IDLE_EXIT_S && app_valid())
                reboot();                          /* e.g. safe mode entered by accident */
        }

        uint16_t sr = USART1->STATR;
        if (!(sr & USART_FLAG_RXNE))
            continue;

        uint8_t b = (uint8_t)USART1->DATAR;        /* also clears FE/NE/ORE */
        if (sr & (USART_FLAG_FE | USART_FLAG_NE)) {
            ab.errors++;
            continue;
        }
        ab.good++;
        idle_s = 0;

        if (parse_byte(b))
            quiet_s = 0;
    }
}

/* -------------------------------------------------------------- main --- */
int main(void)
{
    int stay = 0;

    SystemCoreClockUpdate();
    SysTick->CTLR = 0;
    SysTick->CNT  = 0;
    SysTick->CTLR = (1 << 0) | (1 << 2);       /* run from HCLK, count up, no IRQ */

    RCC_APB1PeriphClockCmd(RCC_APB1Periph_PWR | RCC_APB1Periph_BKP, ENABLE);
    PWR_BackupAccessCmd(ENABLE);

    if (BKP_ReadBackupRegister(BKP_REQ) == OTA_MAGIC) {
        BKP_WriteBackupRegister(BKP_REQ, 0);    /* the app asked for an update */
        BKP_WriteBackupRegister(BKP_RESETS, 0);
        stay = 1;
    } else {
        /* safe mode: count resets that happen within SAFE_WINDOW_MS of boot */
        uint16_t n = (uint16_t)(BKP_ReadBackupRegister(BKP_RESETS) + 1);
        if (n >= SAFE_RESETS) {
            stay = 1;
            n = 0;
        }
        BKP_WriteBackupRegister(BKP_RESETS, n);
        if (!stay) {
            delay_ms(SAFE_WINDOW_MS);           /* a reset now counts towards safe mode */
            BKP_WriteBackupRegister(BKP_RESETS, 0);
        }
    }

    if (!stay && app_valid())
        jump_to_app();

    update_mode();
}
