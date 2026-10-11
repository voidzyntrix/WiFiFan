/*
 * CH32V203C8U6 - USART1 (PA9 = TX, PA10 = RX, 8N1) controls a WS2812 LED on PB3.
 *
 *   send  h=H/S/V  ->  set LED colour as hue 0-359, saturation and brightness
 *                      0-100 (e.g. h=300/100/50); ends rainbow mode
 *   send  l=R/G/B  ->  set LED colour, each value 0-255 (e.g. l=255/0/128)
 *   send  off      ->  turn LED off
 *   send  rain     ->  rainbow mode (hue cycles); any colour command ends it
 *   send  rain=S/V ->  rainbow mode with saturation/brightness 0-100; while the
 *                      rainbow runs this only adjusts S/V and keeps it cycling
 *   send  candle   ->  candle flame: warm orange that breathes and flickers;
 *   send  candle=V ->  ... at brightness V 0-100; any colour command ends it
 *   send  candle=V/M -> M=1: smooth candle (slow, gentle), M=0: lively flicker
 *   send  candle=V/M/H -> ... with flame hue H in degrees (0-60, default 19)
 *   send  rain=S/V/T -> rainbow taking T seconds (2-120) per trip round the wheel
 *   send  fade=MS  ->  colour change duration 0-5000 ms (default 1500)
 *   send  breathe=V / ocean=V / party=V / aurora=V -> animated effects at
 *                      brightness V 0-100 (or without "=V": last brightness):
 *                      breathe = the current colour slowly fades up and down,
 *                      ocean = drifting blues and teals, party = smooth jumps
 *                      between random colours, aurora = slow green-violet waves
 *   candle, rainbow and the effects all replace each other.
 *   send  ver      ->  replies "VER,<FW_VERSION>"
 *   send  ota      ->  replies "OTA", then restarts into the Bluetooth
 *                      bootloader for a firmware update (see the
 *                      CH32V203C8U_Bootloader project)
 *   colour-picker messages from the app are decoded too (see parse_picker)
 *
 * Only ver/ota reply; replies end with '\', the app's line delimiter.
 * Unknown input gives a short white flash.
 *
 * This firmware runs behind the OTA bootloader: it is linked at 0x2000
 * (Ld/Link.ld) and the bootloader occupies the first 8 KB of flash.
 *
 * Colour changes fade smoothly over FADE_MS, through HSV: the hue travels
 * around the colour wheel, so you see every colour in between.
 *
 * A command ends with '\' (the app's delimiter), Enter (\r or \n) or a short
 * pause, so app buttons that send no line ending work too.
 *
 * Since 1.5.0 every R,G,B byte goes through a gamma 2.2 table (gamma8)
 * just before it is sent to the WS2812, so fades and dim levels look even
 * to the eye. Nonzero levels never drop below 1 (0 stays off).
 *
 * Baud rate is detected automatically (9600 / 19200 / 38400 / 57600 / 115200):
 * if a burst of data arrives garbled, the shortest pulse on PA10 (= one bit)
 * is measured and the USART switches to the matching rate. The LED flashes
 * blue when that happens; the first command after a switch may be lost.
 *
 * Two WS2812 drivers, chosen by WS_USE_DMA:
 *   1 = TIM2 CH2 PWM (PB3 via partial remap 1) + DMA1 ch2
 *   0 = software timing from the SysTick counter (known to work on this board)
 * Needs a 72 MHz core clock (set in system_ch32v20x.c). No interrupts are used.
 */
#include "ch32v20x.h"
#include <string.h>

#define WS_USE_DMA   0               /* 1 = timer + DMA, 0 = polled SysTick */

#define FW_VERSION   "1.5.0"        /* reported by "ver"; bump for each release */

#define START_BAUD   115200          /* used until a baud rate has been detected */

/* Backup registers shared with the bootloader (keep in sync with its main.c).
 * They survive resets: the "ota" command leaves a request there, and the
 * detected baud rate is kept so both the bootloader and the next boot of
 * this firmware start at the right speed. */
#define BKP_REQ      BKP_DR1         /* OTA_MAGIC = "stay in the bootloader" */
#define BKP_BAUD     BKP_DR2         /* UART baud / 100 */
#define OTA_MAGIC    0xB007
#define NUM_LEDS     1
#define BRIGHT       0x30            /* 0-255, WS2812s are very bright */

#define TICKS_PER_US 72u             /* SysTick runs at the 72 MHz core clock */
#define TICKS_PER_MS 72000u

/* WS2812 bit timing in core clock ticks (1 tick = 13.9 ns) */
#define T_PERIOD     90              /* 1.25 us */
#define T_0H         22              /* ~0.30 us (same as the version that worked) */
#define T_1H         50              /* ~0.70 us */

static volatile int ws_ok;           /* DMA driver: 1 = last frame completed */

/* free-running SysTick counter, polled; low 32 bits wrap every ~59 s */
static inline uint32_t now(void)
{
    return *(volatile uint32_t *)&SysTick->CNT;
}

#if WS_USE_DMA
/* ---------------------------------------------------------------- DMA --- */
#define RESET_SLOTS  64              /* low slots after the data (~80 us) */
#define DATA_BITS    (24 * NUM_LEDS)
#define BUF_LEN      (1 + DATA_BITS + RESET_SLOTS)   /* [0] = dummy low slot */

static uint16_t ws_buf[BUF_LEN];

static void ws_hw_init(void)
{
    GPIO_InitTypeDef        g = {0};
    TIM_TimeBaseInitTypeDef tb = {0};
    TIM_OCInitTypeDef       oc = {0};

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB | RCC_APB2Periph_AFIO, ENABLE);
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM2, ENABLE);
    RCC_AHBPeriphClockCmd(RCC_AHBPeriph_DMA1, ENABLE);

    GPIO_PinRemapConfig(GPIO_PartialRemap1_TIM2, ENABLE);   /* TIM2_CH2 -> PB3 */

    g.GPIO_Pin   = GPIO_Pin_3;
    g.GPIO_Mode  = GPIO_Mode_AF_PP;
    g.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOB, &g);

    tb.TIM_Period        = T_PERIOD - 1;
    tb.TIM_Prescaler     = 0;
    tb.TIM_ClockDivision = TIM_CKD_DIV1;
    tb.TIM_CounterMode   = TIM_CounterMode_Up;
    TIM_TimeBaseInit(TIM2, &tb);

    oc.TIM_OCMode      = TIM_OCMode_PWM1;
    oc.TIM_OutputState = TIM_OutputState_Enable;
    oc.TIM_Pulse       = 0;                       /* idle low */
    oc.TIM_OCPolarity  = TIM_OCPolarity_High;
    TIM_OC2Init(TIM2, &oc);
    TIM_OC2PreloadConfig(TIM2, TIM_OCPreload_Disable);   /* new value applies at once */
}

static void ws_write(uint8_t r, uint8_t g, uint8_t b)
{
    uint32_t grb = ((uint32_t)g << 16) | ((uint32_t)r << 8) | b;
    int n = 0;

    ws_buf[n++] = 0;                              /* dummy slot: first update fires after one period */
    for (int led = 0; led < NUM_LEDS; led++)
        for (int bit = 23; bit >= 0; bit--)
            ws_buf[n++] = (grb & (1u << bit)) ? T_1H : T_0H;
    while (n < BUF_LEN) ws_buf[n++] = 0;          /* reset / latch */

    DMA_InitTypeDef d = {0};
    DMA_DeInit(DMA1_Channel2);
    d.DMA_PeripheralBaseAddr = (uint32_t)&TIM2->CH2CVR;
    d.DMA_MemoryBaseAddr     = (uint32_t)ws_buf;
    d.DMA_DIR                = DMA_DIR_PeripheralDST;
    d.DMA_BufferSize         = BUF_LEN;
    d.DMA_PeripheralInc      = DMA_PeripheralInc_Disable;
    d.DMA_MemoryInc          = DMA_MemoryInc_Enable;
    d.DMA_PeripheralDataSize = DMA_PeripheralDataSize_HalfWord;
    d.DMA_MemoryDataSize     = DMA_MemoryDataSize_HalfWord;
    d.DMA_Mode               = DMA_Mode_Normal;
    d.DMA_Priority           = DMA_Priority_VeryHigh;
    d.DMA_M2M                = DMA_M2M_Disable;
    DMA_Init(DMA1_Channel2, &d);

    TIM_Cmd(TIM2, DISABLE);
    TIM2->CH2CVR = 0;
    TIM_SetCounter(TIM2, 0);
    TIM_ClearFlag(TIM2, TIM_FLAG_Update);
    DMA_ClearFlag(DMA1_FLAG_TC2);

    TIM_DMACmd(TIM2, TIM_DMA_Update, ENABLE);
    DMA_Cmd(DMA1_Channel2, ENABLE);
    TIM_Cmd(TIM2, ENABLE);

    /* wait for DMA to finish, but never hang (a hang here silences serial too) */
    uint32_t guard = 2000000;
    while (DMA_GetFlagStatus(DMA1_FLAG_TC2) == RESET && --guard);
    ws_ok = (guard != 0);
    for (volatile int i = 0; i < 200; i++);       /* let the last (low) slot finish */

    TIM_Cmd(TIM2, DISABLE);
    TIM_DMACmd(TIM2, TIM_DMA_Update, DISABLE);
    DMA_Cmd(DMA1_Channel2, DISABLE);
    TIM2->CH2CVR = 0;
}

#else
/* ------------------------------------------------------------ polled --- */
#define WS_HIGH()    (GPIOB->BSHR = GPIO_Pin_3)
#define WS_LOW()     (GPIOB->BCR  = GPIO_Pin_3)

static void ws_hw_init(void)
{
    GPIO_InitTypeDef g = {0};

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB | RCC_APB2Periph_AFIO, ENABLE);

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

static void ws_write(uint8_t r, uint8_t g, uint8_t b)
{
    for (int i = 0; i < NUM_LEDS; i++) {
        ws_send_byte(g);                 /* WS2812 order is GRB */
        ws_send_byte(r);
        ws_send_byte(b);
    }
    WS_LOW();
    uint32_t t0 = now();
    while ((uint32_t)(now() - t0) < 100 * TICKS_PER_US);   /* >80 us reset */
    ws_ok = 1;
}
#endif

/* Gamma correction (gamma 2.2) for the WS2812, which is linear in PWM duty
 * while the eye is not. Generated with Python:
 *   [0] + [max(1, round(255 * (i / 255) ** 2.2)) for i in range(1, 256)]
 * i.e. nonzero inputs map to at least 1 so very dim levels stay visible. */
static const uint8_t gamma8[256] = {
      0,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,   1,
      1,   1,   1,   1,   1,   1,   1,   1,   1,   2,   2,   2,   2,   2,   2,   2,
      3,   3,   3,   3,   3,   4,   4,   4,   4,   5,   5,   5,   5,   6,   6,   6,
      6,   7,   7,   7,   8,   8,   8,   9,   9,   9,  10,  10,  11,  11,  11,  12,
     12,  13,  13,  13,  14,  14,  15,  15,  16,  16,  17,  17,  18,  18,  19,  19,
     20,  20,  21,  22,  22,  23,  23,  24,  25,  25,  26,  26,  27,  28,  28,  29,
     30,  30,  31,  32,  33,  33,  34,  35,  35,  36,  37,  38,  39,  39,  40,  41,
     42,  43,  43,  44,  45,  46,  47,  48,  49,  49,  50,  51,  52,  53,  54,  55,
     56,  57,  58,  59,  60,  61,  62,  63,  64,  65,  66,  67,  68,  69,  70,  71,
     73,  74,  75,  76,  77,  78,  79,  81,  82,  83,  84,  85,  87,  88,  89,  90,
     91,  93,  94,  95,  97,  98,  99, 100, 102, 103, 105, 106, 107, 109, 110, 111,
    113, 114, 116, 117, 119, 120, 121, 123, 124, 126, 127, 129, 130, 132, 133, 135,
    137, 138, 140, 141, 143, 145, 146, 148, 149, 151, 153, 154, 156, 158, 159, 161,
    163, 165, 166, 168, 170, 172, 173, 175, 177, 179, 181, 182, 184, 186, 188, 190,
    192, 194, 196, 197, 199, 201, 203, 205, 207, 209, 211, 213, 215, 217, 219, 221,
    223, 225, 227, 229, 231, 234, 236, 238, 240, 242, 244, 246, 248, 251, 253, 255
};

/* The one place colours reach the LED: gamma-corrects the final RGB. */
static void ws_set(uint8_t r, uint8_t g, uint8_t b)
{
    ws_write(gamma8[r], gamma8[g], gamma8[b]);
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
    g.GPIO_Mode = GPIO_Mode_IPU;               /* pull-up: idle line stays high */
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
    BKP_WriteBackupRegister(BKP_BAUD, (uint16_t)(baud / 100));
}

/* Baud rate to start with: the last one detected (kept across resets). */
static uint32_t saved_baud(void)
{
    uint16_t v = BKP_ReadBackupRegister(BKP_BAUD);
    return (v >= 96 && v <= 1152) ? v * 100u : START_BAUD;
}

/* Non-blocking TX: text is queued and sent one byte per main-loop pass, so
 * replies never stall reception. */
#define TXQ_SIZE 64
static char     txq[TXQ_SIZE];
static uint16_t txq_head, txq_tail;

static void tx_put(char c)
{
    uint16_t next = (txq_head + 1) % TXQ_SIZE;
    if (next != txq_tail) { txq[txq_head] = c; txq_head = next; }
}

static void tx_str(const char *s) { while (*s) tx_put(*s++); }

/* One reply line, ended with the app's delimiter. */
static void reply(const char *s) { tx_str(s); tx_put('\\'); }

static void tx_poll(void)
{
    if (txq_tail != txq_head && (USART1->STATR & USART_FLAG_TXE)) {
        USART1->DATAR = (uint8_t)txq[txq_tail];
        txq_tail = (txq_tail + 1) % TXQ_SIZE;
    }
}

/* Send everything still queued and wait until the last bit is out. */
static void tx_flush(void)
{
    while (txq_tail != txq_head) tx_poll();
    while (!(USART1->STATR & USART_FLAG_TC));
}

/* ------------------------------------------------------ baud detection --- */
/* PA10 is sampled on every main-loop pass. Within a burst of activity the
 * shortest pulse between two edges is one bit time. When the burst ends
 * (line idle for 20 ms) and it produced line errors or no good bytes, the
 * USART is switched to the standard rate that matches that bit time. */
static struct {
    uint8_t  level;          /* last sampled PA10 level */
    uint8_t  edge_ok;        /* last_edge was timestamped accurately */
    uint32_t last_sample;
    uint32_t last_edge;
    uint32_t min_pulse;      /* shortest pulse in this burst, in ticks */
    uint16_t edges, good, errors;
} ab = { .level = 1, .min_pulse = 0xFFFFFFFF };

static uint32_t baud_from_bit(uint32_t ticks)
{
    uint32_t us = ticks / TICKS_PER_US;
    if (us < 12) return 115200;     /* bit =   8.7 us */
    if (us < 21) return 57600;      /* bit =  17.4 us */
    if (us < 36) return 38400;      /* bit =  26.0 us */
    if (us < 72) return 19200;      /* bit =  52.1 us */
    return 9600;                    /* bit = 104.2 us */
}

/* Returns a new baud rate to switch to, or 0. */
static uint32_t ab_poll(void)
{
    uint32_t t    = now();
    uint8_t  lvl  = (GPIOA->INDR & GPIO_Pin_10) ? 1 : 0;
    uint8_t  late = (uint32_t)(t - ab.last_sample) > 5 * TICKS_PER_US;   /* loop was busy */
    ab.last_sample = t;

    if (lvl != ab.level) {
        if (ab.edges && ab.edge_ok && !late) {
            uint32_t w = t - ab.last_edge;
            if (w < ab.min_pulse) ab.min_pulse = w;
        }
        ab.level     = lvl;
        ab.last_edge = t;
        ab.edge_ok   = !late;           /* an edge seen late has an unknown time */
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

/* ---------------------------------------------------------------- LED --- */
/* Colours are faded in HSV, not RGB: the hue travels around the colour wheel
 * the short way (see HUE_LONG_WAY), straight to the target, so red -> green
 * passes only through orange and yellow. Each target is converted to HSV, and
 * the fade ends on the exact colour that was asked for. Fades that keep the
 * same hue (to/from off or white, brightness changes) don't sweep the wheel.
 *
 * A new colour mid-fade starts a fresh fade from the current in-between
 * colour, so a dragged picker glides along. Runs from the main loop; nothing
 * blocks while fading. */
#define FADE_MS      1500            /* colour change duration, 0 = instant */
#define FRAME_MS     10              /* LED refresh interval while fading */
#define RAINBOW_MS   15000           /* rainbow mode: one trip around the wheel */
#define RB_ADJUST_MS 250             /* rainbow running: glide to new S/V this fast */
#define HUE_LONG_WAY 0               /* 0 = fades go straight to the target (short way
                                        round the wheel), 1 = the long way round */

#define HUE_MAX      1536            /* hue 0..1535: 6 sectors x 256 steps */

typedef struct { int16_t h; uint8_t s, v; } hsv_t;

static hsv_t rgb_to_hsv(uint8_t r, uint8_t g, uint8_t b)
{
    hsv_t   c;
    uint8_t mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    uint8_t mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    int     d  = mx - mn;
    int     h;

    c.v = mx;
    c.s = mx ? (uint8_t)(d * 255 / mx) : 0;
    if (d == 0) { c.h = 0; return c; }      /* grey: hue undefined */

    if (mx == r)      h =        ((int)g - (int)b) * 256 / d;   /* red    = 0    */
    else if (mx == g) h = 512  + ((int)b - (int)r) * 256 / d;   /* green  = 512  */
    else              h = 1024 + ((int)r - (int)g) * 256 / d;   /* blue   = 1024 */
    if (h < 0)        h += HUE_MAX;
    if (h >= HUE_MAX) h -= HUE_MAX;
    c.h = (int16_t)h;
    return c;
}

static void hsv_to_rgb(hsv_t c, uint8_t out[3])
{
    uint32_t v = c.v, s = c.s;

    if (s == 0) { out[0] = out[1] = out[2] = (uint8_t)v; return; }

    uint32_t sector = (uint32_t)c.h >> 8;   /* 0..5 */
    uint32_t f      = (uint32_t)c.h & 0xFF; /* position inside the sector */
    uint8_t  p = (uint8_t)(v * (255 - s) / 255);
    uint8_t  q = (uint8_t)(v * (255 * 256 - s * f) / (255 * 256));          /* falling */
    uint8_t  t = (uint8_t)(v * (255 * 256 - s * (256 - f)) / (255 * 256));  /* rising  */
    uint8_t  vv = (uint8_t)v;

    switch (sector) {
    case 0:  out[0] = vv; out[1] = t;  out[2] = p;  break;   /* red -> yellow    */
    case 1:  out[0] = q;  out[1] = vv; out[2] = p;  break;   /* yellow -> green  */
    case 2:  out[0] = p;  out[1] = vv; out[2] = t;  break;   /* green -> cyan    */
    case 3:  out[0] = p;  out[1] = q;  out[2] = vv; break;   /* cyan -> blue     */
    case 4:  out[0] = t;  out[1] = p;  out[2] = vv; break;   /* blue -> magenta  */
    default: out[0] = vv; out[1] = p;  out[2] = q;  break;   /* magenta -> red   */
    }
}

static hsv_t    fade_from, fade_to, shown;   /* HSV: start, end, on the LED now */
static int16_t  fade_dh;                     /* hue step (signed: direction) */
static uint8_t  target_rgb[3];               /* exact colour to end on */
static uint8_t  fading, flashing, dirty;
static uint32_t fade_start, flash_end, last_frame;

/* Rainbow mode: hue keeps cycling at rb_s / rb_v. Hue advances by elapsed
 * time accumulated per frame (not from a start time), so it never jumps when
 * the 32-bit tick counter wraps (~every 59 s). */
#define TICKS_PER_HUE  (RAINBOW_MS * TICKS_PER_MS / HUE_MAX)

static uint32_t fade_ms = FADE_MS;          /* "fade=" */
static uint32_t ticks_per_hue = TICKS_PER_HUE;   /* "rain=S/V/T" */
static uint8_t  rainbow, rb_ramp;            /* mode on / still easing S and V */
static hsv_t    rb_from;                     /* S/V when the current ease started */
static uint8_t  rb_s = 255, rb_v = 255;      /* rainbow saturation / brightness */
static uint8_t  last_v = 255;                /* brightness of the last real colour */
static uint32_t rb_start, rb_last, rb_ticks, rb_ramp_ticks;

/* Candle mode: a warm flame whose brightness breathes (two slow sines) and
 * flickers (random targets, smoothed), around brightness cd_v. */
#define CANDLE_HUE   80              /* ~19 deg: deep orange (hue units 0..1535) */
#define CANDLE_SAT   240
static uint8_t  candle, cd_smooth, cd_v = 255;
static int16_t  cd_hue = CANDLE_HUE;         /* flame hue, 0..1535 units */
static uint32_t cd_ms, cd_last;              /* candle clock in ms, last tick */
static float    cd_flick = 0.0f, cd_target = 0.0f;
static uint32_t cd_rand = 0x1234567u;

/* sin(2*pi*x): parabolic approximation (error < 0.1 %), so no libm is needed */
static float sin_turns(float x)
{
    x -= (float)(int)x;                      /* 0..1 for x >= 0 */
    if (x >= 0.5f) x -= 1.0f;                /* -0.5..0.5 */
    float ax = x < 0 ? -x : x;
    float y = 8.0f * x - 16.0f * x * ax;     /* parabola through the sine's zeros/peaks */
    float ay = y < 0 ? -y : y;
    return 0.225f * (y * ay - y) + y;        /* refinement */
}

/* Effects: animated modes that set the colour every frame. */
enum { FX_NONE, FX_BREATHE, FX_OCEAN, FX_PARTY, FX_AURORA };
static uint8_t  fx, fx_v = 255;
static hsv_t    fx_base;                     /* breathe: the colour that breathes */
static uint32_t fx_ms, fx_last, fx_next;     /* effect clock (ms), last tick, next party jump */
static int16_t  fx_target;                   /* party: hue it glides towards */

static float frand(void)                    /* 0..1, xorshift32 */
{
    cd_rand ^= cd_rand << 13; cd_rand ^= cd_rand >> 17; cd_rand ^= cd_rand << 5;
    return (float)(cd_rand >> 8) * (1.0f / 16777216.0f);
}

/* Fade to colour [to] (HSV), ending exactly on [rgb]. */
static void start_fade(hsv_t to, const uint8_t rgb[3])
{
    memcpy(target_rgb, rgb, 3);
    fade_from = shown;
    fade_to   = to;
    if (fade_to.v) last_v = fade_to.v;      /* rainbow reuses this brightness */
    rainbow   = 0;                          /* any colour command ends rainbow mode */
    candle    = 0;                          /* ... and candle mode */
    fx        = FX_NONE;                    /* ... and any effect */

    /* Black and greys have no hue: borrow it from the other end, so fading
     * up from off, down to off, or to/from white doesn't sweep the wheel. */
    if (fade_from.v == 0)                     { fade_from.h = fade_to.h; fade_from.s = fade_to.s; }
    else if (fade_from.s == 0)                  fade_from.h = fade_to.h;
    if (fade_to.v == 0)                       { fade_to.h = fade_from.h; fade_to.s = fade_from.s; }
    else if (fade_to.s == 0)                    fade_to.h = fade_from.h;

    int dh = fade_to.h - fade_from.h;
    if (dh >  HUE_MAX / 2) dh -= HUE_MAX;      /* now the short way, -768..768 */
    if (dh < -HUE_MAX / 2) dh += HUE_MAX;
#if HUE_LONG_WAY
    if (dh > 0)      dh -= HUE_MAX;            /* go round the other side */
    else if (dh < 0) dh += HUE_MAX;            /* (same hue: no sweep) */
#endif
    fade_dh = (int16_t)dh;

    fade_start = now();
    fading   = 1;
    flashing = 0;                   /* a new colour cancels a feedback flash */
}

/* Colour from an RGB command (l=, picker): ends on exactly that RGB. */
static void led_colour(uint8_t r, uint8_t g, uint8_t b)
{
    const uint8_t rgb[3] = { r, g, b };
    start_fade(rgb_to_hsv(r, g, b), rgb);
}

/* Colour from an HSV command (h=): keeps the exact hue, even for greys. */
static void led_hsv(hsv_t c)
{
    uint8_t rgb[3];
    hsv_to_rgb(c, rgb);
    start_fade(c, rgb);
}

/* Rainbow mode with saturation [s] and brightness [v] (0-255). Started from
 * a colour it keeps that hue; from off/white it eases in from red over
 * FADE_MS. If the rainbow is already running only S/V change (quickly, over
 * RB_ADJUST_MS) and the hue keeps cycling. */
static void led_rainbow(uint8_t s, uint8_t v)
{
    uint32_t t = now();

    rb_from = shown;
    if (rainbow) {
        rb_ramp_ticks = RB_ADJUST_MS * TICKS_PER_MS;
    } else {
        if (shown.v == 0 || shown.s == 0) shown.h = 0;
        rb_last  = t;
        rb_ticks = 0;
        rb_ramp_ticks = fade_ms * TICKS_PER_MS;
    }
    candle = 0;                     /* rainbow replaces candle mode */
    fx     = FX_NONE;               /* ... and effects */
    rb_s = s;
    rb_v = v;
    if (v) last_v = v;
    rb_start = t;
    rb_ramp  = 1;
    rainbow  = 1;
    fading   = 0;
    flashing = 0;
    dirty    = 1;
}

/* Candle mode at brightness [v]: fades to the flame colour, then flickers. */
static void led_candle(uint8_t v, uint8_t smooth)
{
    cd_smooth = smooth;
    hsv_t c = { cd_hue, CANDLE_SAT, v };
    led_hsv(c);
    cd_v = v;
    cd_last = now();
    candle = 1;
}

/* Start effect [which] at brightness [v]: fades to its first colour, then animates. */
static void led_fx(uint8_t which, uint8_t v)
{
    hsv_t c;
    switch (which) {
    case FX_BREATHE:                          /* the colour last chosen */
        c = fade_to;
        break;
    case FX_OCEAN:  c.h = 874; c.s = 230; break;          /* ~205 deg */
    case FX_AURORA: c.h = 512; c.s = 210; break;          /* green */
    default:        c.h = shown.h; c.s = 255; break;      /* party */
    }
    c.v = v;
    led_hsv(c);                               /* clears other modes */
    fx = which; fx_v = v; fx_base = c;
    fx_ms = 0; fx_last = now(); fx_next = 0; fx_target = c.h;
}

/* Show a colour briefly, then return to the fade/colour (non-blocking). */
static void led_flash(uint8_t r, uint8_t g, uint8_t b, uint32_t ms)
{
    ws_set(r, g, b);
    flashing  = 1;
    flash_end = now() + ms * TICKS_PER_MS;
}

static void led_poll(void)
{
    uint32_t t = now();
    uint8_t  rgb[3];

    if (flashing) {
        if ((int32_t)(t - flash_end) < 0) return;
        flashing = 0;
        dirty = 1;                  /* put the normal colour back */
    }

    if (fading) {
        const uint32_t dur = fade_ms * TICKS_PER_MS;
        uint32_t elapsed = t - fade_start;

        if (elapsed >= dur) {
            shown  = fade_to;
            fading = 0;
            dirty  = 1;
        }
        else if ((uint32_t)(t - last_frame) >= FRAME_MS * TICKS_PER_MS) {
            int p = (int)(elapsed / ((dur >> 10) + 1));               /* 0..1023 */
            int k = (int)((uint32_t)p * p * (3 * 1024 - 2 * p) / (1024 * 1024));   /* smoothstep */
            int h = fade_from.h + fade_dh * k / 1024;

            if (h < 0)        h += HUE_MAX;
            if (h >= HUE_MAX) h -= HUE_MAX;
            shown.h = (int16_t)h;
            shown.s = (uint8_t)(fade_from.s + (fade_to.s - fade_from.s) * k / 1024);
            shown.v = (uint8_t)(fade_from.v + (fade_to.v - fade_from.v) * k / 1024);
            dirty = 1;
        }
    }

    if (rainbow && (uint32_t)(t - last_frame) >= FRAME_MS * TICKS_PER_MS) {
        rb_ticks += t - rb_last;
        rb_last   = t;
        uint32_t steps = rb_ticks / ticks_per_hue;
        rb_ticks -= steps * ticks_per_hue;
        shown.h = (int16_t)((shown.h + steps) % HUE_MAX);

        if (rb_ramp) {                          /* ease S and V to the rainbow's */
            const uint32_t dur = rb_ramp_ticks;
            uint32_t elapsed = t - rb_start;

            if (elapsed >= dur) {
                shown.s = rb_s;
                shown.v = rb_v;
                rb_ramp = 0;
            } else {
                int p = (int)(elapsed / ((dur >> 10) + 1));
                int k = (int)((uint32_t)p * p * (3 * 1024 - 2 * p) / (1024 * 1024));
                shown.s = (uint8_t)(rb_from.s + (rb_s - rb_from.s) * k / 1024);
                shown.v = (uint8_t)(rb_from.v + (rb_v - rb_from.v) * k / 1024);
            }
        }
        dirty = 1;
    }

    if (fx && !fading && (uint32_t)(t - last_frame) >= FRAME_MS * TICKS_PER_MS) {
        fx_ms  += (t - fx_last) / TICKS_PER_MS;
        fx_last = t - (t - fx_last) % TICKS_PER_MS;
        float tt = fx_ms * 0.001f;
        int h = shown.h;
        float f = 1.0f;
        switch (fx) {
        case FX_BREATHE:                      /* 15 % .. 100 %, 4 s per breath */
            h = fx_base.h; shown.s = fx_base.s;
            f = 0.575f + 0.425f * sin_turns(tt / 4.0f);
            break;
        case FX_OCEAN:                        /* hue drifts 190..225 deg, gentle swell */
            h = 874 + (int)(90.0f * sin_turns(tt / 7.0f) + 40.0f * sin_turns(tt / 2.9f));
            shown.s = 230;
            f = 0.75f + 0.15f * sin_turns(tt / 5.0f) + 0.10f * sin_turns(tt / 1.7f);
            break;
        case FX_AURORA:                       /* hue waves 120..280 deg, slow */
            h = 853 + (int)(341.0f * sin_turns(tt / 18.0f));
            shown.s = 210;
            f = 0.70f + 0.30f * sin_turns(tt / 6.0f);
            break;
        default: {                            /* party: new random hue every 1.5 s */
            if (fx_ms >= fx_next) {
                fx_next = fx_ms + 1500;
                fx_target = (int16_t)(frand() * HUE_MAX);
            }
            int dh = fx_target - h;
            if (dh >  HUE_MAX / 2) dh -= HUE_MAX;
            if (dh < -HUE_MAX / 2) dh += HUE_MAX;
            h += dh / 12 + (dh > 0) - (dh < 0);   /* glide, always moves */
            shown.s = 255;
            break;
        }
        }
        while (h < 0)        h += HUE_MAX;
        while (h >= HUE_MAX) h -= HUE_MAX;
        shown.h = (int16_t)h;
        if (f < 0.0f) f = 0.0f;
        if (f > 1.0f) f = 1.0f;
        shown.v = (uint8_t)(fx_v * f);
        dirty = 1;
    }

    if (candle && !fading && (uint32_t)(t - last_frame) >= FRAME_MS * TICKS_PER_MS) {
        cd_ms  += (t - cd_last) / TICKS_PER_MS;
        cd_last = t - (t - cd_last) % TICKS_PER_MS;
        float tt = cd_ms * 0.001f;
        /* slow breathing: two incommensurate sines */
        float breathe, depth, chance, glide;
        if (cd_smooth) {            /* smooth: slow breathing, rare shallow dips that glide */
            breathe = 0.10f * sin_turns(tt / 4.0f) + 0.05f * sin_turns(tt / 1.5f);
            depth = 0.30f; chance = 0.025f; glide = 0.06f;
        } else {                    /* lively: faster breathing, frequent quick flickers */
            breathe = 0.10f * sin_turns(tt / 2.3f) + 0.06f * sin_turns(tt / 0.77f);
            depth = 0.30f; chance = 0.12f; glide = 0.35f;
        }
        /* flicker: every few frames pick a new random dip, glide towards it */
        if (frand() < chance) cd_target = -depth * frand() * frand();
        cd_flick += (cd_target - cd_flick) * glide;
        float f = 0.82f + breathe + cd_flick;
        if (f < 0.25f) f = 0.25f;
        if (f > 1.0f)  f = 1.0f;
        shown.h = (int16_t)(cd_hue + (int)(cd_flick * 40.0f));   /* dips go a bit redder */
        if (shown.h < 0) shown.h += HUE_MAX;
        shown.s = CANDLE_SAT;
        shown.v = (uint8_t)(cd_v * f);
        dirty = 1;
    }

    if (dirty) {
        if (fading || rainbow || candle || fx) hsv_to_rgb(shown, rgb);
        else                   memcpy(rgb, target_rgb, 3);   /* settled: exact requested RGB */
        ws_set(rgb[0], rgb[1], rgb[2]);
        dirty = 0;
        last_frame = t;
    }
}

/* ----------------------------------------------------------- commands --- */
/* A message ends at a line ending (text only) or after a short pause, so app
 * buttons/pickers that send no line ending, or send raw bytes, work too. */
#define CMD_IDLE_MS  50              /* a pause this long ends a message */
#define LINE_MAX     64

static char    line[LINE_MAX];
static uint8_t line_len, line_overflow;
static uint8_t line_binary;          /* message contains non-text bytes */

/* The app's update request: confirm, leave the request for the bootloader
 * and restart into it. The Bluetooth link stays up (the module keeps its own
 * power), so the app carries on talking to the bootloader. */
static void enter_bootloader(void)
{
    reply("OTA");
    tx_flush();
    BKP_WriteBackupRegister(BKP_REQ, OTA_MAGIC);
    NVIC_SystemReset();
}

/* Copy the message as plain lower-case text: control bytes and quotes become
 * spaces, so app extras like "off\0" or "\"off\"" still read as off. */
static void clean_text(char *out)
{
    uint8_t i;
    for (i = 0; i < line_len; i++) {
        char c = line[i];
        if (c < ' ' || c > '~' || c == '"' || c == '\'') c = ' ';
        else if (c >= 'A' && c <= 'Z') c += 32;
        out[i] = c;
    }
    out[i] = '\0';
}

/* Parse n numbers "a/b/c", each 0..max, spaces allowed around numbers;
 * anything after the last number is ignored. Returns 1 on success. */
static int parse_nums(const char *s, uint16_t out[], int n, uint16_t max)
{
    for (int i = 0; i < n; i++) {
        uint32_t v = 0;
        int digits = 0;
        while (*s == ' ') s++;
        while (*s >= '0' && *s <= '9') {
            v = v * 10 + (uint32_t)(*s++ - '0');
            if (++digits > 4) return 0;
        }
        while (*s == ' ') s++;
        if (!digits || v > max) return 0;
        out[i] = (uint16_t)v;
        if (i < n - 1 && *s++ != '/') return 0;
    }
    return 1;
}

static int parse_rgb(const char *s, uint8_t out[3])
{
    uint16_t v[3];
    if (!parse_nums(s, v, 3, 255)) return 0;
    for (int i = 0; i < 3; i++) out[i] = (uint8_t)v[i];
    return 1;
}

/* 0-100 % -> 0-255 */
static uint8_t pct(uint16_t p) { return (uint8_t)((p * 255u + 50u) / 100u); }

static int hexval(char c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    return -1;                          /* text is already lower-case */
}

/* Best-effort decode of a colour-picker message (cleaned text). Tried in order:
 *   "#rrggbb" / "#aarrggbb"     -> hex colour
 *   "255,0,128" / "r255g0b128"  -> first 3 numbers = R, G, B (+ 4th = brightness)
 *   "-65536" / "16711680"       -> one integer = Android/App Inventor colour
 * *br is -1 when the message carries no brightness. Returns 1 on success. */
static int parse_picker(const char *t, uint8_t rgb[3], int *br)
{
    *br = -1;

    const char *h = strchr(t, '#');
    if (h) {
        int n = 0;
        while (hexval(h[1 + n]) >= 0) n++;
        if (n == 6 || n == 8) {
            const char *p = h + 1 + (n - 6);           /* skip aa */
            for (int i = 0; i < 3; i++)
                rgb[i] = (uint8_t)(hexval(p[2 * i]) * 16 + hexval(p[2 * i + 1]));
            return 1;
        }
    }

    /* pull out up to 5 integers (a '-' right before digits makes it negative) */
    uint32_t num[5];
    int      cnt = 0;
    for (const char *p = t; *p && cnt < 5; ) {
        if (*p >= '0' && *p <= '9') {
            int neg = (p > t && p[-1] == '-');
            uint32_t v = 0;
            int digits = 0;
            while (*p >= '0' && *p <= '9') {
                if (++digits <= 10) v = v * 10 + (uint32_t)(*p - '0');
                p++;
            }
            num[cnt++] = neg ? 0u - v : v;
        } else {
            p++;
        }
    }

    if (cnt >= 3 && num[0] <= 255 && num[1] <= 255 && num[2] <= 255) {
        rgb[0] = (uint8_t)num[0]; rgb[1] = (uint8_t)num[1]; rgb[2] = (uint8_t)num[2];
        if (cnt >= 4 && num[3] <= 255) *br = (int)num[3];
        return 1;
    }
    if (cnt == 1 && num[0] > 255) {                       /* colour as one integer */
        rgb[0] = (uint8_t)(num[0] >> 16);
        rgb[1] = (uint8_t)(num[0] >> 8);
        rgb[2] = (uint8_t)num[0];
        return 1;
    }
    return 0;
}

/* Brightness <= 100 is taken as a percentage, above that as 0-255. */
static uint8_t apply_br(uint8_t v, int br)
{
    if (br < 0) return v;
    return (uint8_t)((uint32_t)v * (uint32_t)br / (br <= 100 ? 100u : 255u));
}

/* The cleaned text without leading/trailing spaces, for exact matches. */
static const char *trimmed(char *t)
{
    size_t n;
    while (*t == ' ') t++;
    n = strlen(t);
    while (n && t[n - 1] == ' ') t[--n] = '\0';
    return t;
}

/* End of a message: decode it and act on it. Only ver/ota reply. */
static void line_end(void)
{
    char        t[LINE_MAX];
    const char *p, *w;
    uint8_t     rgb[3];
    uint16_t    n[3];
    int         br;

    if (!line_len && !line_overflow) return;
    line[line_len] = '\0';
    clean_text(t);
    w = trimmed(t);

    if (line_overflow) {
        led_flash(BRIGHT, BRIGHT, BRIGHT, 60);   /* white flash = not understood */
    }
    else if (strcmp(w, "ver") == 0) {
        reply("VER," FW_VERSION);
    }
    else if (strcmp(w, "ota") == 0) {
        enter_bootloader();
    }
    else if (strstr(w, "off")) {
        led_colour(0, 0, 0);
    }
    else if (strncmp(w, "candle=", 7) == 0 && parse_nums(w + 7, n, 3, 100) && n[2] <= 60) {
        cd_hue = (int16_t)(n[2] * HUE_MAX / 360);
        led_candle(pct(n[0]), n[1] != 0);
    }
    else if (strncmp(w, "candle=", 7) == 0 && parse_nums(w + 7, n, 2, 100)) {
        cd_hue = CANDLE_HUE;
        led_candle(pct(n[0]), n[1] != 0);
    }
    else if (strncmp(w, "candle=", 7) == 0 && parse_nums(w + 7, n, 1, 100)) {
        led_candle(pct(n[0]), 0);
    }
    else if (strncmp(w, "breathe", 7) == 0 || strncmp(w, "ocean", 5) == 0 ||
             strncmp(w, "party", 5) == 0 || strncmp(w, "aurora", 6) == 0) {
        uint8_t which = w[0] == 'b' ? FX_BREATHE : w[0] == 'o' ? FX_OCEAN :
                        w[0] == 'p' ? FX_PARTY : FX_AURORA;
        const char *eq = strchr(w, '=');
        if (eq && parse_nums(eq + 1, n, 1, 100)) led_fx(which, pct(n[0]));
        else if (!eq)                            led_fx(which, last_v);
        else                                     led_flash(BRIGHT, BRIGHT, BRIGHT, 60);
    }
    else if (strcmp(w, "candle") == 0) {
        led_candle(last_v, 0);
    }
    else if (strncmp(w, "fade=", 5) == 0 && parse_nums(w + 5, n, 1, 5000)) {
        fade_ms = n[0];
    }
    else if (strncmp(w, "rain=", 5) == 0 && parse_nums(w + 5, n, 3, 120) && n[0] <= 100 && n[1] <= 100) {
        uint16_t sec = n[2] < 2 ? 2 : n[2];
        ticks_per_hue = (uint32_t)sec * 1000u * TICKS_PER_MS / HUE_MAX;
        led_rainbow(pct(n[0]), pct(n[1]));
    }
    else if (strncmp(w, "rain=", 5) == 0 && parse_nums(w + 5, n, 2, 100)) {
        led_rainbow(pct(n[0]), pct(n[1]));
    }
    else if (strstr(w, "rain")) {
        led_rainbow(255, last_v);
    }
    else if (strncmp(w, "h=", 2) == 0 && parse_nums(w + 2, n, 3, 360)
             && n[1] <= 100 && n[2] <= 100) {
        hsv_t c = { (int16_t)((n[0] % 360u) * HUE_MAX / 360u), pct(n[1]), pct(n[2]) };
        led_hsv(c);
    }
    else if ((p = strstr(w, "l=")) && parse_rgb(p + 2, rgb)) {
        led_colour(rgb[0], rgb[1], rgb[2]);
    }
    else {
        int ok = parse_picker(w, rgb, &br);

        if (!ok && line_binary && (line_len == 3 || line_len == 4)) {
            /* raw bytes: R, G, B (+ brightness) */
            rgb[0] = (uint8_t)line[0];
            rgb[1] = (uint8_t)line[1];
            rgb[2] = (uint8_t)line[2];
            br = (line_len == 4) ? (uint8_t)line[3] : -1;
            ok = 1;
        }

        if (ok)
            led_colour(apply_br(rgb[0], br), apply_br(rgb[1], br), apply_br(rgb[2], br));
        else
            led_flash(BRIGHT, BRIGHT, BRIGHT, 60);   /* white flash = not understood */
    }

    line_len = line_overflow = line_binary = 0;
}

/* --------------------------------------------------------------- main --- */
int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();

    SysTick->CTLR = 0;
    SysTick->CNT  = 0;
    SysTick->CTLR = (1 << 0) | (1 << 2);       /* run from HCLK, count up, no IRQ */

    RCC_APB1PeriphClockCmd(RCC_APB1Periph_PWR | RCC_APB1Periph_BKP, ENABLE);
    PWR_BackupAccessCmd(ENABLE);               /* backup registers: baud + OTA request */

    ws_hw_init();
    usart_init(saved_baud());

    led_colour(BRIGHT, 0, 0);                  /* boot: red, proves the LED works */
#if WS_USE_DMA
    if (!ws_ok) led_flash(BRIGHT, BRIGHT, 0, 1000);   /* yellow: DMA driver failed */
#endif

    uint32_t last_rx = 0;

    while (1) {
        tx_poll();
        led_poll();

        uint32_t nb = ab_poll();
        if (nb) {
            usart_init(nb);
            line_len = line_overflow = line_binary = 0;   /* drop whatever arrived garbled */
            led_flash(0, 0, BRIGHT, 300);      /* blue flash = baud rate changed */
            continue;
        }

        /* a pause ends the message (needed for raw bytes / no line ending) */
        if ((line_len || line_overflow) &&
            (uint32_t)(now() - last_rx) > CMD_IDLE_MS * TICKS_PER_MS)
            line_end();

        uint16_t sr = USART1->STATR;
        if (!(sr & USART_FLAG_RXNE))
            continue;

        uint8_t b = (uint8_t)USART1->DATAR;    /* STATR then DATAR read also clears FE/NE/ORE */
        if (sr & (USART_FLAG_FE | USART_FLAG_NE)) {
            ab.errors++;                       /* garbled byte: ignore it */
            continue;
        }
        ab.good++;
        last_rx = now();

        /* '\', CR and LF end a text message; inside a raw-byte message they are data */
        if ((b == '\\' || b == '\r' || b == '\n') && !line_binary) {
            line_end();
            continue;
        }
        if (line_len < LINE_MAX - 1) {
            line[line_len++] = (char)b;
            if (b < 0x20 || b > 0x7E) line_binary = 1;
        } else {
            line_overflow = 1;
        }
    }
}
