/*
 * CH32V203C8U6 - USART1 (PA9 = TX, PA10 = RX, 8N1) drives a ring of 24
 * chained WS2812 LEDs on PB3. Full protocol: firmware/PROTOCOL.md.
 *
 * The ring is shown as two LEDs for the two-LED commands: LED1 is the first
 * 12 pixels, LED2 the last 12. Each pixel has its own colour and fade.
 *   send  split=0  ->  Linked (default at boot): every pixel shows the same
 *   send  split=1  ->  Separate: every pixel is individual (candles, breathe)
 *   send  p=I/H/S/V -> one pixel I (0-23) to HSV (2.1.0)
 *   send  pal=H/S/V,H/S/V,... -> pixel k = entry k, up to 24 entries (2.1.0)
 *   send  decay=MS -> while armed, p= pixels fade to black over MS when not
 *                      re-armed; decay=0 holds (2.1.17)
 *   send  h1=H/S/V, h2=H/S/V, l1=R/G/B, l2=R/G/B -> colour of one half of the ring
 *                      (works in both modes); ends any effect
 *   send  hh=H1/S1/V1/H2/S2/V2 -> both halves in one command (for streaming)
 *
 *   send  h=H/S/V  ->  set the whole ring to hue 0-359, saturation and brightness
 *                      0-100 (e.g. h=300/100/50); ends the running effect
 *   send  l=R/G/B  ->  set the whole ring, each value 0-255 (e.g. l=255/0/128)
 *   send  off      ->  turn the ring off
 *   send  rain     ->  rainbow: a wheel of colour round the ring, turning
 *   send  rain=S/V ->  rainbow with saturation/brightness 0-100; while it runs this
 *                      only adjusts S/V and keeps it turning
 *   send  rain=S/V/T -> rainbow taking T seconds (2-120) per turn of the wheel
 *   send  candle   ->  candle: every pixel is its own flame (warm, breathing, flickering)
 *   send  candle=V ->  ... at brightness V 0-100
 *   send  candle=V/M -> M=1: smooth candle (slow, gentle), M=0: lively flicker
 *   send  candle=V/M/H -> ... with flame hue H in degrees (0-60, default 19)
 *   send  candle=V/M/H/S -> S is accepted and ignored (every flame is individual)
 *   send  spin=H/S/V/T -> spinner: a flat arc of 8 pixels in this colour chasing round
 *                      the ring, one turn every T seconds (1-60); a brightness-only h=
 *                      keeps it turning (2.1.2). spin=H/S/V/T/F (2.1.11) adds a falloff
 *                      of F% of the ring's length fading out behind the arc, so its light
 *                      seems to bloom into the LEDs behind it (F 0 = off, the default);
 *                      spin=H/S/V/T/F/W (2.1.12) with W 1 fades it into the LEDs ahead
 *                      of the head too; spin=H/S/V/T/F/W/L (2.1.13) with L the arc's
 *                      length in pixels (1-12, default 8) - a spin= sent while it turns
 *                      keeps the head where it was and only re-learns the settings;
 *                      spin=H/S/V/T/F/W/L/P (2.1.16) with P the leak's strength 0-100
 *                      (the whole ramp burns at that share, default 100)
 *   send  breathe=V -> the last colour fades up and down over 4 s (Separate: as a wave round the ring)
 *   send  fade=MS  ->  colour change duration 0-5000 ms (default 1500)
 *   Rainbow, candle, breathe and spin replace each other; a colour command ends them.
 *   send  sleep=M  ->  sleep timer (1.7.0): the light, whatever it shows, fades
 *                      smoothly to off over M minutes (1-240), then the LEDs
 *                      are off. Colours and modes sent meanwhile keep fading
 *                      with it. sleep=0 cancels it (full brightness again).
 *   send  alert=C/S/M -> blink alert (1.8.0), for the phone's battery: C 1 = red,
 *                      2 = green; two short blinks every S seconds (5-3600) for
 *                      M minutes (0 = no end). The blinks show over the running
 *                      mode and give its colours back; they never replace it.
 *                      The app repeats the command every minute as a sign of
 *                      life (a repeat only refreshes, the time left is kept);
 *                      with no byte from the phone for 150 s the alert ends by
 *                      itself (Bluetooth dropped). alert=0 cancels.
 *   send  ver      ->  replies "VER,<FW_VERSION>"
 *   send  leds     ->  replies "LEDS,<pixels>,<leds>" (1.10.0): the ring has <pixels>
 *                      WS2812s, shown as <leds> LEDs (LED1 first half, LED2 second)
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
 * Since 1.5.0 every R,G,B byte went through a gamma 2.2 table (gamma8); removed in 2.1.6
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
 * Needs a 72 MHz core clock (set in system_ch32v20x.c). The LED signal is
 * generated in hardware (2.1.9, WS_USE_DMA = 1): TIM2 CH2 PWM paces DMA1 ch2,
 * which loads each bit's compare value at period boundaries, so the waveform is
 * exact and no interrupt can stretch it. Bit-banging with interrupts on could
 * not be made safe: 2.1.7 let the UART byte interrupt preempt a bit and stretch
 * its high (stray colour flashes), 2.1.8 masked the high so the interrupt ran
 * in the bit's low half which stretched the period instead (duty-cycle decoders
 * read that as a dimming bit - random brightness dips in sync modes, which
 * stream bytes continuously). The USART RX interrupt and its byte queue are
 * untouched: during a frame they now run freely, nothing can lose a byte, and
 * ws_write still blocks the main loop for the frame (~0.75 ms) plus its DMA
 * wait. The polled driver (0) stays in the source as the instant fallback if
 * this board shows a silicon quirk (one-line change, rebuild, re-flash).
 */
#include "ch32v20x.h"
#include <string.h>

#define WS_USE_DMA   1               /* 1 = timer + DMA, 0 = polled SysTick */

#define FW_VERSION   "2.1.22"    /* reported by "ver"; bump for each release */

#define START_BAUD   115200          /* used until a baud rate has been detected */

/* Backup registers shared with the bootloader (keep in sync with its main.c).
 * They survive resets: the "ota" command leaves a request there, and the
 * detected baud rate is kept so both the bootloader and the next boot of
 * this firmware start at the right speed. */
#define BKP_REQ      BKP_DR1         /* OTA_MAGIC = "stay in the bootloader" */
#define BKP_BAUD     BKP_DR2         /* UART baud / 100 */
#define OTA_MAGIC    0xB007
#define STR2(x)      #x
#define STR(x)       STR2(x)
#define NUM_LEDS     2               /* logical LEDs: LED1 and LED2 (the app's two) */
#define RING_PIXELS  24              /* WS2812s on the ring, chained from PB3 */
#define PX_PER_LED   (RING_PIXELS / NUM_LEDS)   /* LED1 = first half of the ring, LED2 = second */
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
#define DATA_BITS    (24 * RING_PIXELS)
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

/* One frame: px[i] = R,G,B of LED i (LED1 first). Each LED fills its share of the ring. */
static void ws_write(const uint8_t px[RING_PIXELS][3])
{
    int n = 0;

    ws_buf[n++] = 0;                              /* dummy slot: first update fires after one period */
    for (int pix = 0; pix < RING_PIXELS; pix++) {
        uint32_t grb = ((uint32_t)px[pix][1] << 16) | ((uint32_t)px[pix][0] << 8) | px[pix][2];
        for (int bit = 23; bit >= 0; bit--)
            ws_buf[n++] = (grb & (1u << bit)) ? T_1H : T_0H;
    }
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
        /* The pulse WIDTH is what a WS2812 reads, so it must not be stretched:
         * a high sent with interrupts off always lasts exactly th. The USART RX
         * interrupt (byte queuing) defers into this bit's low half, where a
         * stretch is harmless (see the header above); starting late is fine
         * too, only the width matters. */
        __disable_irq();
        WS_HIGH();
        while ((uint32_t)(now() - t0) < th);
        WS_LOW();
        __enable_irq();
        while ((uint32_t)(now() - t0) < T_PERIOD);
    }
}

#define WS_LATCH_US  300             /* low gap that latches a frame (WS2812B: >280 us) */

static uint8_t  ws_sent;             /* a frame was sent; ws_end = when it ended */
static uint32_t ws_end;

/* One frame: px[i] = R,G,B of LED i (LED1 first, LED2's bits follow
 * straight after). Instead of waiting for the latch gap after the frame
 * (which would block reception), the gap is enforced before the next frame;
 * frames are >= 10 ms apart, so this normally never waits. */
static void ws_write(const uint8_t px[RING_PIXELS][3])
{
    while (ws_sent && (uint32_t)(now() - ws_end) < WS_LATCH_US * TICKS_PER_US);
    for (int pix = 0; pix < RING_PIXELS; pix++) {
        ws_send_byte(px[pix][1]);        /* WS2812 order is GRB */
        ws_send_byte(px[pix][0]);
        ws_send_byte(px[pix][2]);
    }
    WS_LOW();
    ws_end  = now();
    ws_sent = 1;
    ws_ok   = 1;
}
#endif

/* No gamma correction (2.1.6): colours go to the LEDs as they are, so every mode keeps its hue at any brightness. */

/* The one place colours reach the LEDs: applies the sleep timer, nothing else. */
/* Sleep timer: every colour is scaled by this (0..256). */
static uint16_t sleep_k = 256;

static void ws_set(const uint8_t px[RING_PIXELS][3])
{
    uint8_t g[RING_PIXELS][3];
    for (int i = 0; i < RING_PIXELS; i++)
        for (int c = 0; c < 3; c++) g[i][c] = (uint8_t)((px[i][c] * sleep_k) >> 8);
    ws_write((const uint8_t (*)[3])g);
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

    /* The receive side is interrupt-driven: bytes queue up even while the main
     * loop is inside a frame write. */
    USART_ITConfig(USART1, USART_IT_RXNE, ENABLE);
    NVIC_InitTypeDef nv = {0};
    nv.NVIC_IRQChannel = USART1_IRQn;
    nv.NVIC_IRQChannelPreemptionPriority = 0;
    nv.NVIC_IRQChannelSubPriority        = 3;
    nv.NVIC_IRQChannelCmd                = ENABLE;
    NVIC_Init(&nv);

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

/* ------------------------------------------------------- receive queue --- */
/* Bytes land in this ring from the USART1 IRQ: a WS2812 frame keeps the main
 * loop silent for about 700 us on every 10 ms tick while an animation renders,
 * which is exactly when the polled reader used to lose whatever arrived - the
 * line came in with holes, and the board either flashed "not understood" or
 * parsed some mangled cousin of the command. Nothing gets dropped any more.
 * Frame errors now count here too, so the baud detector still sees them (ORE,
 * bytes lost to overrun, counts the same as a framing error). */
#define RXQ_SIZE 128                     /* a power of two: ~11 ms of 115200 baud */
static volatile uint8_t  rxq[RXQ_SIZE];
static volatile uint16_t rxq_head = 0, rxq_tail = 0;    /* IRQ fills, loop drains */
static volatile uint32_t rx_last;                       /* newest byte's arrival tick */

static volatile uint8_t rx_flag;        /* a byte arrived; the alert idle detection reads this */

void USART1_IRQHandler(void) __attribute__((interrupt("WCH-Interrupt-fast")));
void USART1_IRQHandler(void)
{
    uint16_t sr = USART1->STATR;
    uint8_t  b  = (uint8_t)USART1->DATAR;    /* this read clears RXNE, FE, NE and ORE */
    if (sr & (USART_FLAG_ORE | USART_FLAG_FE | USART_FLAG_NE)) ab.errors++;
    else                                                       ab.good++;
    uint16_t next = (uint16_t)((rxq_head + 1) % RXQ_SIZE);
    if (next != rxq_tail) {                  /* on overflow only the new byte is dropped */
        rxq[rxq_head]      = b;
        rxq_head           = next;
    }
    rx_last = now();
    rx_flag = 1;
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

/* Per-pixel state. Every pixel of the ring has its own state. The two-LED
 * commands (h1=, h2=, hh=, l1=, l2=) address the halves: LED1 is the first
 * half of the ring, LED2 the second. Linked (split=0): all pixels show the
 * same. Separate (split=1): each pixel is individual. */
typedef struct {
    hsv_t    shown, fade_from, fade_to;      /* HSV: on the pixel now, fade start, fade end */
    int16_t  fade_dh;                        /* hue step (signed: direction) */
    uint8_t  target_rgb[3];                  /* exact colour to end on */
    uint8_t  fading;
    uint32_t fade_start;
    hsv_t    rb_from;                        /* rainbow: S/V when the current ease started */
    hsv_t    fx_base;                        /* breathe: the colour that animates */
    float    cd_flick, cd_target;            /* candle flicker */
    uint32_t rnd;                            /* own xorshift32 state */
    uint32_t decay_at;                       /* "decay=" (2.1.17): tick this pixel starts fading to black */
    uint16_t trail_ms;                       /* the trail time this pixel armed with (2.1.20): the
                                              * countdown's length belongs to the write, so a later
                                              * decay= (slider drag) can't jump a running fade */
} led_t;

static led_t    L[RING_PIXELS];
static uint8_t  split;                       /* 0 = Linked (boot default), 1 = Separate */
static uint8_t  flashing, dirty;
static uint8_t  sleeping;                    /* "sleep=M" running */
static uint32_t sleep_start, sleep_ms;       /* when it started, how long it takes */
static uint32_t flash_end, last_frame;

/* Hue step between neighbouring pixels: a full wheel round the ring. */
#define RING_STEP    (HUE_MAX / RING_PIXELS)

/* Rainbow mode: the wheel turns at rb_s / rb_v, one trip per RAINBOW seconds
 * (rain=S/V/T). Hue advances by elapsed time accumulated per frame, so it
 * never jumps when the 32-bit tick counter wraps (~every 59 s). */
#define TICKS_PER_HUE  (RAINBOW_MS * TICKS_PER_MS / HUE_MAX)

static uint32_t fade_ms = FADE_MS;          /* "fade=" */
static uint32_t decay_ms = 0;               /* "decay=" (2.1.17), 0 = off: p= writes fade out by themselves */
static uint32_t ticks_per_hue = TICKS_PER_HUE;   /* "rain=S/V/T" */
static uint8_t  rainbow, rb_ramp;            /* mode on / still easing S and V */
static uint8_t  rb_s = 255, rb_v = 255;      /* rainbow saturation / brightness */
static uint8_t  last_v = 255;                /* brightness of the last real colour */
static uint32_t rb_start, rb_last, rb_ticks, rb_ramp_ticks;
static int      rb_hue;                      /* rainbow: hue of pixel 0 */

/* Candle mode: each pixel is its own flame (its breathing and flicker are its
 * own), around brightness cd_v. */
#define CANDLE_HUE   80              /* ~19 deg: deep orange (hue units 0..1535) */
#define CANDLE_SAT   240
static uint8_t  candle, cd_smooth, cd_v = 255;
static int16_t  cd_hue = CANDLE_HUE;         /* flame hue, 0..1535 units */
static uint32_t cd_ms, cd_last;              /* candle clock in ms, last tick */

/* Spinner: a flat arc chasing round the ring, with an optional falloff behind it. */
#define SPIN_TAIL    8                       /* default arc length, pixels (the command can set another, 2.1.13) */
#define SPIN_FP      256u                    /* sub-pixel steps per pixel */
static uint8_t  spin;
static hsv_t    spin_c;
static uint32_t spin_period, spin_t, spin_last;   /* one turn in ms, clock, last tick */
static uint32_t spin_arc;                         /* the arc's length, in sub-pixels (default SPIN_TAIL) */
static uint32_t spin_falloff;                     /* fade-out length behind the arc, in sub-pixels (0 = none) */
static uint8_t  spin_falloff_front;               /* the falloff also fades into the LEDs ahead of the head */
static uint16_t spin_strength;                    /* the leak's brightness, 0..1024 of its ramp (2.1.16) */

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

/* Breathe: the last colour slowly fades up and down (4 s). */
enum { FX_NONE, FX_BREATHE };
static uint8_t  fx, fx_v = 255;
static uint32_t fx_ms, fx_last;              /* effect clock (ms), last tick */

static void leds_init(void)
{
    for (int p = 0; p < RING_PIXELS; p++) L[p].rnd = 0x1234567u + (uint32_t)p * 0x9E3779B9u;
}

static float frand(led_t *d)                 /* 0..1, xorshift32 */
{
    d->rnd ^= d->rnd << 13; d->rnd ^= d->rnd >> 17; d->rnd ^= d->rnd << 5;
    return (float)(d->rnd >> 8) * (1.0f / 16777216.0f);
}

static int16_t hue_wrap(int h)
{
    while (h < 0)        h += HUE_MAX;
    while (h >= HUE_MAX) h -= HUE_MAX;
    return (int16_t)h;
}

/* Signed hue distance a -> b the short way round, -768..768. */
static int hue_diff(int a, int b)
{
    int dh = b - a;
    if (dh >  HUE_MAX / 2) dh -= HUE_MAX;
    if (dh < -HUE_MAX / 2) dh += HUE_MAX;
    return dh;
}

/* Fade pixel [i] to colour [to] (HSV), ending exactly on [rgb]. Leaves the
 * modes alone (see end_modes). */
static void fade_led(uint8_t i, hsv_t to, const uint8_t rgb[3])
{
    led_t *d = &L[i];

    d->decay_at = 0;                    /* a fresh colour is its own: no decay envelope over it */
    memcpy(d->target_rgb, rgb, 3);
    d->fade_from = d->shown;
    d->fade_to   = to;
    if (to.v) last_v = to.v;                /* rainbow reuses this brightness */

    /* Black and greys have no hue: borrow it from the other end, so fading
     * up from off, down to off, or to/from white doesn't sweep the wheel. */
    if (d->fade_from.v == 0)        { d->fade_from.h = d->fade_to.h; d->fade_from.s = d->fade_to.s; }
    else if (d->fade_from.s == 0)     d->fade_from.h = d->fade_to.h;
    if (d->fade_to.v == 0)          { d->fade_to.h = d->fade_from.h; d->fade_to.s = d->fade_from.s; }
    else if (d->fade_to.s == 0)       d->fade_to.h = d->fade_from.h;

    int dh = hue_diff(d->fade_from.h, d->fade_to.h);   /* the short way, -768..768 */
#if HUE_LONG_WAY
    if (dh > 0)      dh -= HUE_MAX;            /* go round the other side */
    else if (dh < 0) dh += HUE_MAX;            /* (same hue: no sweep) */
#endif
    d->fade_dh = (int16_t)dh;

    d->fade_start = now();
    d->fading = 1;
    flashing  = 0;                  /* a new colour cancels a feedback flash */
}

/* End rainbow/candle/breathe/spinner. A pixel not fading keeps the colour it
 * shows right now. */
static void end_modes(void)
{
    if (rainbow || candle || fx || spin)
        for (int i = 0; i < RING_PIXELS; i++)
            if (!L[i].fading) {
                hsv_to_rgb(L[i].shown, L[i].target_rgb);
                L[i].fade_to = L[i].shown;
            }
    rainbow = 0;
    candle  = 0;
    fx      = FX_NONE;
    spin    = 0;
}

/* Stop the decay= stream state (2.1.17): nothing armed, nothing counting down
 * to black. The effects lay their own colours every frame - none of them may
 * keep fading out underneath. */
static void decay_stop(void)
{
    decay_ms = 0;
    for (int i = 0; i < RING_PIXELS; i++) { L[i].decay_at = 0; L[i].trail_ms = 0; }
}

/* One half of the ring (0 = LED1, 1 = LED2), from an HSV command (h1=/h2=/hh=). */
static void led_hsv_one(uint8_t half, hsv_t c)
{
    uint8_t rgb[3];
    hsv_to_rgb(c, rgb);
    end_modes();
    for (uint8_t p = half * PX_PER_LED; p < (half + 1) * PX_PER_LED; p++) fade_led(p, c, rgb);
}

/* One half of the ring, from an RGB command (l1=/l2=): ends on exactly that RGB. */
static void led_colour_one(uint8_t half, const uint8_t rgb[3])
{
    end_modes();
    hsv_t c = rgb_to_hsv(rgb[0], rgb[1], rgb[2]);
    for (uint8_t p = half * PX_PER_LED; p < (half + 1) * PX_PER_LED; p++) fade_led(p, c, rgb);
}

/* A running spinner turns on through a brightness change only (2.1.2): same hue
 * and saturation, new value. Any other colour ends it, as before. */
static uint8_t spin_brightness_only(hsv_t c)
{
    if (c.h != spin_c.h || c.s != spin_c.s) return 0;
    spin_c.v = c.v;
    dirty = 1;
    return 1;
}

/* The whole ring, from an RGB command (l=, picker, off). */
static void led_colour(uint8_t r, uint8_t g, uint8_t b)
{
    const uint8_t rgb[3] = { r, g, b };
    hsv_t c = rgb_to_hsv(r, g, b);
    if (spin && spin_brightness_only(c)) return;
    end_modes();
    for (uint8_t p = 0; p < RING_PIXELS; p++) fade_led(p, c, rgb);
}

/* The whole ring, from an HSV command (h=). */
static void led_hsv(hsv_t c)
{
    uint8_t rgb[3];
    if (spin && spin_brightness_only(c)) return;
    hsv_to_rgb(c, rgb);
    end_modes();
    for (uint8_t p = 0; p < RING_PIXELS; p++) fade_led(p, c, rgb);
}

/* Rainbow mode with saturation [s] and brightness [v] (0-255). The wheel sits
 * round the ring: pixel p is RING_STEP hue units further on than p-1. Started
 * from a colour it keeps that hue; from off/white it eases in from red over
 * FADE_MS. If the rainbow is already running only S/V change (quickly, over
 * RB_ADJUST_MS) and the wheel keeps turning. */
static void led_rainbow(uint8_t s, uint8_t v)
{
    uint32_t t = now();

    decay_stop();                   /* the wheel lays its own colours; no pixel fades away under it */
    for (int i = 0; i < RING_PIXELS; i++) {
        L[i].rb_from = L[i].shown;
        if (!rainbow && (L[i].shown.v == 0 || L[i].shown.s == 0)) L[i].shown.h = 0;
        L[i].fading = 0;
    }
    if (rainbow) {
        rb_ramp_ticks = RB_ADJUST_MS * TICKS_PER_MS;
    } else {
        rb_last  = t;
        rb_ticks = 0;
        rb_hue   = L[0].shown.h;
        rb_ramp_ticks = fade_ms * TICKS_PER_MS;
    }
    candle = 0;                     /* rainbow replaces candle mode */
    fx     = FX_NONE;               /* ... effects */
    spin   = 0;                     /* ... and the spinner */
    rb_s = s;
    rb_v = v;
    if (v) last_v = v;
    rb_start = t;
    rb_ramp  = 1;
    rainbow  = 1;
    flashing = 0;
    dirty    = 1;
}

/* Candle mode at brightness [v]: fades every pixel to the flame colour, then
 * each one flickers on its own (Linked: all the same). */
static void led_candle(uint8_t v, uint8_t smooth)
{
    hsv_t   c = { cd_hue, CANDLE_SAT, v };
    uint8_t rgb[3];

    decay_stop();                   /* the flames lay their own colours; no pixel fades away under them */
    hsv_to_rgb(c, rgb);
    rainbow = 0;
    fx      = FX_NONE;
    spin    = 0;
    for (uint8_t i = 0; i < RING_PIXELS; i++) fade_led(i, c, rgb);
    cd_smooth = smooth;
    cd_v = v;
    cd_last = now();
    candle = 1;
}

/* Colour of pixel [p] at effect time [tt] s for breathe. Separate: each pixel
 * is a step further round the breath, so a wave runs round the ring. */
static hsv_t fx_eval(uint8_t p, float tt)
{
    hsv_t c = L[p].fx_base;
    float f = 0.575f + 0.425f * sin_turns(tt / 4.0f + (split ? (float)p / RING_PIXELS : 0.0f));
    c.v = (uint8_t)(fx_v * f);
    return c;
}

/* Start breathe at brightness [v]: fades each pixel to its first colour, then
 * animates. */
static void led_fx(uint8_t v)
{
    uint8_t keep_v = last_v;

    decay_stop();                   /* breathe lays its own colours; no pixel fades away under it */
    for (int p = 0; p < RING_PIXELS; p++) L[p].fx_base = split ? L[p].fade_to : L[0].fade_to;
    rainbow = 0;
    candle  = 0;
    spin    = 0;
    fx = FX_BREATHE; fx_v = v;
    fx_ms = 0; fx_last = now();

    for (uint8_t p = 0; p < RING_PIXELS; p++) {
        hsv_t   c = fx_eval(p, 0.0f);
        uint8_t rgb[3];
        hsv_to_rgb(c, rgb);
        fade_led(p, c, rgb);
    }
    last_v = v ? v : keep_v;                  /* not the effect's first-frame level */
}

/* "split=": Linked <-> Separate. A running breathe restarts (fading smoothly
 * into the new layout); Linked solid colours: every pixel fades to pixel 0's. */
static void set_split(uint8_t s)
{
    if (s == split) return;
    split = s;
    if (fx) {
        led_fx(fx_v);
    } else if (!rainbow && !spin && !candle && !split) {
        for (uint8_t p = 1; p < RING_PIXELS; p++) fade_led(p, L[0].fade_to, L[0].target_rgb);
    }
}

/* Show a colour briefly on the whole ring, then return to the fade/colour (non-blocking). */
static void led_flash(uint8_t r, uint8_t g, uint8_t b, uint32_t ms)
{
    uint8_t px[RING_PIXELS][3];
    for (int i = 0; i < RING_PIXELS; i++) { px[i][0] = r; px[i][1] = g; px[i][2] = b; }
    ws_set((const uint8_t (*)[3])px);
    flashing  = 1;
    flash_end = now() + ms * TICKS_PER_MS;
}

/* Spinner: colour [c], one turn of the ring every [secs] seconds, an arc [arc_px] pixels
 * long, with a falloff of [falloff_pct]% of the RING's length fading out behind it (0 = the
 * plain flat arc, 2.1.15 measures F against the whole ring so it scales the same on any
 * arc), the leak burning at [strength_pct]% of its ramp (2.1.16, 100 = full), and with
 * [falloff_front] also into the LEDs ahead of the head. While the
 * spinner is already turning, the turn keeps its position and the arc only re-learns the
 * settings (2.1.13 - sliders stopped restarting it; a brightness-only h= never did, 2.1.2). */
static void led_spin(hsv_t c, uint32_t secs, uint16_t falloff_pct, uint8_t falloff_front, uint16_t arc_px, uint16_t strength_pct)
{
    uint8_t  was       = spin;          /* read before end_modes() clears the mode flags */
    uint32_t old_period = spin_period;
    uint32_t old_t     = spin_t;

    decay_stop();                   /* the spinner lays its own colours; no pixel fades away under it */
    end_modes();
    for (int i = 0; i < RING_PIXELS; i++) L[i].fading = 0;
    spin_c      = c;
    spin_period = secs * 1000u;
    spin_arc    = (uint32_t)arc_px * SPIN_FP;
    uint32_t fall = (uint32_t)falloff_pct * (RING_PIXELS * SPIN_FP) / 100;   /* F% of the ring's length, not the arc's (2.1.15) */
    uint32_t cap  = (RING_PIXELS * SPIN_FP - spin_arc) / 2;        /* so the two leaks never meet */
    spin_falloff       = fall > cap ? cap : fall;
    spin_falloff_front = falloff_front ? 1 : 0;
    spin_strength      = (uint16_t)((uint32_t)strength_pct * 1024 / 100);   /* leak brightness, 0..1024 of the ramp */
    if (was && old_period) {
        /* The same arc, new settings: scale the phase by the turn-length change, which
         * keeps the head exactly where it was (the old position, as a share of the turn). */
        spin_t    = (uint32_t)((uint64_t)(old_t % old_period) * spin_period / old_period);
        spin_last = now();               /* the phase clock restarts from this moment's phase */
    } else {
        spin_t    = 0;
        spin_last = now();
    }
    spin        = 1;
    flashing    = 0;
    dirty       = 1;
}

/* Candle breathing at time [tt] s (two incommensurate sines) and the dip
 * parameters for the current style (smooth / lively). */
static float cd_breathe(float tt, float *depth, float *chance, float *glide)
{
    if (cd_smooth) {            /* smooth: slow breathing, rare shallow dips that glide */
        *depth = 0.30f; *chance = 0.025f; *glide = 0.06f;
        return 0.10f * sin_turns(tt / 4.0f) + 0.05f * sin_turns(tt / 1.5f);
    }
    /* lively: faster breathing, frequent quick flickers */
    *depth = 0.30f; *chance = 0.12f; *glide = 0.35f;
    return 0.10f * sin_turns(tt / 2.3f) + 0.06f * sin_turns(tt / 0.77f);
}

static float clampf(float x, float lo, float hi)
{
    return x < lo ? lo : x > hi ? hi : x;
}

/* One candle frame for pixel [p]: its own flicker, and in Separate its own
 * point in the breathing. */
static void candle_frame(uint8_t p, float tt)
{
    led_t *d = &L[p];

    if (split) tt += (float)p * 0.37f;
    float depth, chance, glide;
    float breathe = cd_breathe(tt, &depth, &chance, &glide);
    /* flicker: every few frames pick a new random dip, glide towards it */
    if (frand(d) < chance) d->cd_target = -depth * frand(d) * frand(d);
    d->cd_flick += (d->cd_target - d->cd_flick) * glide;
    float f = clampf(0.82f + breathe + d->cd_flick, 0.25f, 1.0f);
    d->shown.h = hue_wrap(cd_hue + (int)(d->cd_flick * 40.0f));   /* dips go a bit redder */
    d->shown.s = CANDLE_SAT;
    d->shown.v = (uint8_t)(cd_v * f);
}

/* One spinner frame: the flat arc (spin_arc, default SPIN_TAIL pixels) at full brightness,
 * chasing round the ring (the head is crisp, every pixel inside is on). What follows it
 * behind is a falloff (2.1.11): the next spin_falloff sub-pixels of LEDs fade evenly from
 * the colour to black, an every-step-dimmer leak instead of a clean cut-off (linear since
 * 2.1.14: a curved fade gets lost in the output's gamma). With spin_falloff_front (2.1.12)
 * the same leak mirrors across the head, into the sub-pixels of LEDs ahead of it. The
 * falloff is clamped at set time so the two leaks never meet even on a long arc. Falloff 0
 * is the plain flat arc. */
static void spin_frame(uint32_t t)
{
    if (!spin) return;
    spin_t   += (t - spin_last) / TICKS_PER_MS;
    spin_last = t - (t - spin_last) % TICKS_PER_MS;

    uint32_t ph   = spin_t % spin_period;
    uint32_t span = RING_PIXELS * SPIN_FP;
    uint32_t head = (uint32_t)((uint64_t)ph * span / spin_period);   /* head, in sub-pixels */
    uint32_t arc  = spin_arc;
    uint32_t fall = spin_falloff;
    uint32_t st   = spin_strength;                   /* the ramp burns at this share, 0..1024 (2.1.16) */

    for (uint8_t p = 0; p < RING_PIXELS; p++) {
        uint32_t d = (head + span - (uint32_t)p * SPIN_FP) % span;   /* how far behind the head */
        led_t *px = &L[p];
        px->shown.h = spin_c.h;
        px->shown.s = spin_c.s;
        if (d < arc) {
            px->shown.v = spin_c.v;                    /* the arc, full brightness */
        } else if (fall && d < arc + fall) {
            /* The falloff behind: full colour at the arc's end, an even (linear) fade to
             * black over the leak's length. Every step is a visible one dimmer than the
             * last - the quadratic easing tried first (2.1.11) put all its drop into the
             * first pixel, which the board's gamma then crushed toward black, so the
             * falloff read as on/off. */
            uint32_t x  = ((d - arc) << 10) / fall;    /* 0..1023 into the falloff */
            uint32_t k  = 1024 - x;
            px->shown.v = (uint8_t)((uint32_t)spin_c.v * k * st / (1024 * 1024));
        } else if (spin_falloff_front && fall && d >= span - fall) {
            /* The falloff ahead of the head: the mirror of the one behind, full colour at
             * the head easing down evenly to black over the same length. The zones never
             * overlap: arc + fall <= 4096 and this zone starts at span - fall >= 4096, so
             * at the worst setting they just meet. */
            uint32_t a  = span - d;                    /* how far ahead of the head */
            uint32_t x  = (a << 10) / fall;            /* 0..1023 out of the falloff */
            uint32_t k  = 1024 - x;
            px->shown.v = (uint8_t)((uint32_t)spin_c.v * k * st / (1024 * 1024));
        } else {
            px->shown.v = 0;
        }
    }
}

/* Candle output (2.1.3): the flame colour is worked out at full brightness and then
 * scaled as a whole by its level, so the hue holds as it dims. */
static void candle_out(uint8_t px[RING_PIXELS][3])
{
    for (int i = 0; i < RING_PIXELS; i++) {
        hsv_t   full = L[i].shown;
        uint8_t rgb[3];
        full.v = 255;
        hsv_to_rgb(full, rgb);
        uint32_t level = ((uint32_t)L[i].shown.v * sleep_k) >> 8;
        for (int c = 0; c < 3; c++) px[i][c] = (uint8_t)((rgb[c] * level + 127u) / 255u);
    }
}

static void led_poll(void)
{
    uint32_t t     = now();
    uint8_t  frame = (uint32_t)(t - last_frame) >= FRAME_MS * TICKS_PER_MS;
    uint8_t  busy  = 0;                        /* a pixel is still fading */

    if (flashing) {
        if ((int32_t)(t - flash_end) < 0) return;
        flashing = 0;
        dirty = 1;                  /* put the normal colour back */
    }

    if (frame)                      /* decay= (2.1.17): a countdown keeps redrawing its pixel */
        for (int i = 0; i < RING_PIXELS; i++)
            if (L[i].decay_at) { dirty = 1; break; }

    for (int i = 0; i < RING_PIXELS; i++) {
        led_t *d = &L[i];
        if (!d->fading) continue;

        const uint32_t dur = fade_ms * TICKS_PER_MS;
        uint32_t elapsed = t - d->fade_start;

        if (elapsed >= dur) {
            d->shown  = d->fade_to;
            d->fading = 0;
            dirty = 1;
        }
        else {
            busy = 1;
            if (frame) {
                int p = (int)(elapsed / ((dur >> 10) + 1));               /* 0..1023 */
                int k = (int)((uint32_t)p * p * (3 * 1024 - 2 * p) / (1024 * 1024));   /* smoothstep */

                d->shown.h = hue_wrap(d->fade_from.h + d->fade_dh * k / 1024);
                d->shown.s = (uint8_t)(d->fade_from.s + (d->fade_to.s - d->fade_from.s) * k / 1024);
                d->shown.v = (uint8_t)(d->fade_from.v + (d->fade_to.v - d->fade_from.v) * k / 1024);
                dirty = 1;
            }
        }
    }

    if (rainbow && frame) {
        rb_ticks += t - rb_last;
        rb_last   = t;
        uint32_t steps = rb_ticks / ticks_per_hue;
        rb_ticks -= steps * ticks_per_hue;
        rb_hue = hue_wrap(rb_hue + (int)(steps % HUE_MAX));

        int k = 1024;                           /* ease S and V to the rainbow's */
        if (rb_ramp) {
            const uint32_t dur = rb_ramp_ticks;
            uint32_t elapsed = t - rb_start;
            if (elapsed >= dur) {
                rb_ramp = 0;
            } else {
                int p = (int)(elapsed / ((dur >> 10) + 1));
                k = (int)((uint32_t)p * p * (3 * 1024 - 2 * p) / (1024 * 1024));
            }
        }
        for (int i = 0; i < RING_PIXELS; i++) {
            led_t *d = &L[i];
            /* each pixel glides to its place on the wheel */
            int target = rb_hue + i * RING_STEP;
            int dh = hue_diff(d->shown.h, hue_wrap(target));
            int h  = d->shown.h + dh / 8 + (dh > 0) - (dh < 0);
            d->shown.h = hue_wrap(h);
            d->shown.s = (uint8_t)(d->rb_from.s + (rb_s - d->rb_from.s) * k / 1024);
            d->shown.v = (uint8_t)(d->rb_from.v + (rb_v - d->rb_from.v) * k / 1024);
        }
        dirty = 1;
    }

    if (fx && !busy && frame) {
        fx_ms  += (t - fx_last) / TICKS_PER_MS;
        fx_last = t - (t - fx_last) % TICKS_PER_MS;
        float tt = fx_ms * 0.001f;
        for (uint8_t p = 0; p < RING_PIXELS; p++) L[p].shown = fx_eval(p, tt);
        dirty = 1;
    }

    if (candle && !busy && frame) {
        cd_ms  += (t - cd_last) / TICKS_PER_MS;
        cd_last = t - (t - cd_last) % TICKS_PER_MS;
        float tt = cd_ms * 0.001f;
        for (uint8_t p = 0; p < RING_PIXELS; p++) candle_frame(p, tt);
        if (!split) for (uint8_t p = 1; p < RING_PIXELS; p++) L[p].shown = L[0].shown;   /* Linked: one flame */
        dirty = 1;
    }

    if (spin && !busy && frame) {
        spin_frame(t);
        dirty = 1;
    }

    if (sleeping && frame) {
        uint32_t el = (t - sleep_start) / TICKS_PER_MS;
        if (el >= sleep_ms) {
            /* Faded out: turn the LEDs off for real (at once, they are dark already) and
             * give the next colour its full brightness back. */
            sleeping = 0;
            led_colour(0, 0, 0);
            for (int i = 0; i < RING_PIXELS; i++) { L[i].shown = L[i].fade_to; L[i].fading = 0; }
            sleep_k = 256;
            dirty = 1;
        } else {
            uint16_t k = (uint16_t)(256u - 256u * el / sleep_ms);
            if (k != sleep_k) { sleep_k = k; dirty = 1; }
        }
    }

    if (dirty) {
        uint8_t px[RING_PIXELS][3];
        uint8_t anim = rainbow || candle || fx || spin;
        for (int i = 0; i < RING_PIXELS; i++) {
            if (L[i].fading || anim) hsv_to_rgb(L[i].shown, px[i]);
            else memcpy(px[i], L[i].target_rgb, 3);    /* settled: exact requested RGB */
            if (L[i].decay_at) {                      /* decay= (2.1.18): fades to black on its own */
                const int32_t  left = (int32_t)(L[i].decay_at - t);
                const uint32_t dur  = L[i].trail_ms * TICKS_PER_MS;
                if (left < 0) {                           /* run out: black, and it stays black */
                    /* the pixel's own memory goes black too - the output redraws it all the
                     * time (the beat's LED re-arms), and a settled colour would jump it back
                     * to full brightness, undoing the whole fade (2.1.17 did exactly that) */
                    L[i].fading = 0;
                    L[i].shown.v = 0;
                    L[i].target_rgb[0] = 0; L[i].target_rgb[1] = 0; L[i].target_rgb[2] = 0;
                    L[i].decay_at = 0;
                    /* AND the frame itself must draw black: px already holds the raw colour
                     * (copied before this branch, the envelope only ever scaled px), and the
                     * next redraw is the next beat's write - so 2.1.19 sent every dying dot
                     * for one frame at full brightness: near zero, blink, back to zero */
                    px[i][0] = 0; px[i][1] = 0; px[i][2] = 0;
                }
                else if (L[i].trail_ms && left < (int32_t)dur) {   /* linear to black over trail_ms */
                    /* k = left * 256 / dur: left and dur are ticks (72000 a ms), so the
                     * multiply passes 32 bits for anything over ~233 ms of decay (2.1.18
                     * and older wrapped it round and flickered through most of the fade) */
                    const uint32_t k = (uint32_t)(((uint64_t)left * 256u) / dur);
                    for (int c = 0; c < 3; c++) px[i][c] = (uint8_t)((px[i][c] * k + 127u) >> 8);
                }
            }
        }
        if (candle) { candle_out(px); ws_write((const uint8_t (*)[3])px); }
        else        ws_set((const uint8_t (*)[3])px);
        dirty = 0;
        last_frame = t;
    }
}

/* ----------------------------------------------------------- commands --- */
/* A message ends at a line ending (text only) or after a short pause, so app
 * buttons/pickers that send no line ending, or send raw bytes, work too. */
/* ---------------------------------------------------------- alerts --- */
#define ALERT_SILENCE_MS 150000u     /* no byte from the phone this long: it is gone */

static uint8_t           alert_kind;                 /* 0 none, 1 red, 2 green */
static uint8_t           alert_step;                 /* 0 wait, 1 blink 1 shown, 2 gap, 3 blink 2 shown */
static uint32_t          alert_every_ms, alert_left_ms, alert_wait_ms, alert_quiet_ms, alert_last;

static void alert_poll(void)
{
    if (!alert_kind) return;
    uint32_t t  = now();
    uint32_t dt = (t - alert_last) / TICKS_PER_MS;
    if (dt == 0) return;
    alert_last += dt * TICKS_PER_MS;

    if (rx_flag) { rx_flag = 0; alert_quiet_ms = 0; }
    else         alert_quiet_ms += dt;
    if (alert_quiet_ms >= ALERT_SILENCE_MS) { alert_kind = 0; return; }
    if (alert_left_ms) {
        if (dt >= alert_left_ms) { alert_kind = 0; return; }
        alert_left_ms -= dt;
    }

    if (flashing) return;                            /* a blink (or another flash) is showing */
    if (alert_wait_ms > dt) { alert_wait_ms -= dt; return; }
    alert_wait_ms = 0;

    switch (alert_step) {
    case 0:
    case 2:
        if (alert_kind == 1) led_flash((uint8_t)(BRIGHT * 3), 0, 0, 180);
        else                 led_flash(0, (uint8_t)(BRIGHT * 3), 0, 180);
        alert_step++;
        break;
    case 1:
        alert_wait_ms = 220;                         /* the gap between the two blinks */
        alert_step = 2;
        break;
    default:
        alert_wait_ms = alert_every_ms;
        alert_step = 0;
        break;
    }
}

static void alert_command(uint8_t kind, uint32_t every_s, uint32_t minutes)
{
    if (kind && kind == alert_kind) { alert_quiet_ms = 0; return; }   /* a repeat: just a sign of life */
    alert_kind     = kind;
    alert_every_ms = every_s * 1000u;
    alert_left_ms  = minutes * 60000u;
    alert_wait_ms  = 0;
    alert_step     = 0;
    alert_quiet_ms = 0;
    alert_last     = now();
}

#define CMD_IDLE_MS  50              /* a pause this long ends a message */
#define LINE_MAX     320             /* a full 24-pixel pal= list is ~300 characters */

static char    line[LINE_MAX];
static uint16_t line_len;
static uint8_t line_overflow;
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
    uint16_t i;
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

/* Parse "H/S/V" (hue 0-360 deg, S and V 0-100 %) times [count] (1 or 2). */
static int parse_hsv(const char *s, hsv_t out[], int count)
{
    uint16_t n[6];
    if (!parse_nums(s, n, 3 * count, 360)) return 0;
    for (int i = 0; i < count; i++) {
        const uint16_t *m = n + 3 * i;
        if (m[1] > 100 || m[2] > 100) return 0;
        out[i].h = (int16_t)((m[0] % 360u) * HUE_MAX / 360u);
        out[i].s = pct(m[1]);
        out[i].v = pct(m[2]);
    }
    return 1;
}

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

/* One pixel, from p=I/H/S/V (2.1.0): a colour command like h=, so it fades and ends effects. */
static void led_pixel(uint8_t p, hsv_t c)
{
    uint8_t rgb[3];
    hsv_to_rgb(c, rgb);
    end_modes();
    fade_led(p, c, rgb);
    /* decay= (2.1.17): while it is armed, a written pixel fades to black when
     * nothing re-arms it - the streaming modes' per-LED trail is the board's
     * to run, and it restarts on every fresh write. */
    if (decay_ms) { L[p].decay_at = now() + decay_ms * TICKS_PER_MS; L[p].trail_ms = decay_ms; }
}

/* Several pixels, from pal=H/S/V,H/S/V,... (2.1.0): entry k is pixel k. Stops at the
 * first bad entry; returns how many entries were read. */
static int parse_palette(const char *s, hsv_t out[])
{
    int cnt = 0;
    while (cnt < RING_PIXELS) {
        uint16_t v[3];
        for (int k = 0; k < 3; k++) {
            uint32_t x = 0;
            int digits = 0;
            while (*s == ' ') s++;
            while (*s >= '0' && *s <= '9') {
                x = x * 10u + (uint32_t)(*s++ - '0');
                if (++digits > 4) return cnt;
            }
            while (*s == ' ') s++;
            if (!digits) return cnt;
            v[k] = (uint16_t)x;
            if (k < 2) {
                if (*s != '/') return cnt;
                s++;
            }
        }
        if (v[0] > 360 || v[1] > 100 || v[2] > 100) return cnt;
        out[cnt].h = (int16_t)((v[0] % 360u) * HUE_MAX / 360u);
        out[cnt].s = pct(v[1]);
        out[cnt].v = pct(v[2]);
        cnt++;
        while (*s == ' ') s++;
        if (*s != ',') break;
        s++;
    }
    return cnt;
}

/* The first [cnt] pixels from a palette, as one colour command (fades, ends effects). */
static void led_palette(const hsv_t pal[], int cnt)
{
    end_modes();
    for (int i = 0; i < cnt; i++) {
        uint8_t rgb[3];
        hsv_to_rgb(pal[i], rgb);
        fade_led((uint8_t)i, pal[i], rgb);
    }
}

/* `spin=H/S/V/T`, plus an optional 5th number F (2.1.11): the falloff radius, F% of the RING's
 * length fading out behind it (2.1.15 - through 2.1.14 it was % of the arc's length), a
 * 6th W (2.1.12): 1 also fades the falloff into the LEDs
 * ahead of the head, a 7th L (2.1.13): the arc's length in pixels, 1 to half the ring
 * (default 8), and an 8th P (2.1.16): the leak's strength, 0-100 (default 100) - the whole
 * ramp burns at that share. Older forms still work: the 4-number command has no falloff,
 * the 5-number one fades only behind, the 6-number keeps the 8-pixel arc, the 7-number
 * burns the leak at full; older hardware accepts and ignores the numbers it does not know.
 * 1 on success. */
static int spin_parse(const char *s, uint16_t n[], uint16_t *falloff, uint8_t *front, uint16_t *length, uint16_t *strength)
{
    *falloff  = 0;
    *front    = 0;
    *length   = SPIN_TAIL;
    *strength = 100;
    if (parse_nums(s, n, 8, 360)) {
        if (n[1] > 100 || n[2] > 100 || n[3] < 1 || n[3] > 60 || n[4] > 100 || n[5] > 1) return 0;
        if (n[6] < 1 || n[6] > RING_PIXELS / 2) return 0;
        if (n[7] > 100) return 0;
        *falloff  = n[4];
        *front    = (uint8_t)n[5];
        *length   = n[6];
        *strength = n[7];
        return 1;
    }
    if (parse_nums(s, n, 7, 360)) {
        if (n[1] > 100 || n[2] > 100 || n[3] < 1 || n[3] > 60 || n[4] > 100 || n[5] > 1) return 0;
        if (n[6] < 1 || n[6] > RING_PIXELS / 2) return 0;
        *falloff = n[4];
        *front   = (uint8_t)n[5];
        *length  = n[6];
        return 1;
    }
    if (parse_nums(s, n, 6, 360)) {
        if (n[1] > 100 || n[2] > 100 || n[3] < 1 || n[3] > 60 || n[4] > 100 || n[5] > 1) return 0;
        *falloff = n[4];
        *front   = (uint8_t)n[5];
        return 1;
    }
    if (parse_nums(s, n, 5, 360)) {
        if (n[1] > 100 || n[2] > 100 || n[3] < 1 || n[3] > 60 || n[4] > 100) return 0;
        *falloff = n[4];
        return 1;
    }
    return parse_nums(s, n, 4, 360) && n[1] <= 100 && n[2] <= 100 && n[3] >= 1 && n[3] <= 60;
}

/* End of a message: decode it and act on it. Only ver/ota reply. */
static void line_end(void)
{
    char        t[LINE_MAX];
    const char *p, *w;
    uint8_t     rgb[3];
    uint16_t    n[8];
    uint16_t    falloff;
    uint16_t    length;
    uint16_t    strength;
    uint8_t     front;
    hsv_t       hv[2];
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
    else if (strcmp(w, "leds") == 0) {
        reply("LEDS," STR(RING_PIXELS) "," STR(NUM_LEDS));
    }
    else if (strcmp(w, "ota") == 0) {
        enter_bootloader();
    }
    else if (strncmp(w, "alert=", 6) == 0) {               /* C/S/M, or 0 to cancel */
        if (parse_nums(w + 6, n, 3, 3600) && n[0] >= 1 && n[0] <= 2 && n[1] >= 5 && n[2] <= 240)
            alert_command((uint8_t)n[0], n[1], n[2]);
        else if (parse_nums(w + 6, n, 1, 3600) && n[0] == 0)
            alert_command(0, 0, 0);
        else
            led_flash(BRIGHT, BRIGHT, BRIGHT, 60);
    }
    else if (strncmp(w, "sleep=", 6) == 0) {               /* minutes, 0 = cancel */
        if (parse_nums(w + 6, n, 1, 240)) {
            sleeping    = n[0] != 0;
            sleep_start = now();
            sleep_ms    = n[0] * 60000u;
            if (!sleeping) { sleep_k = 256; dirty = 1; }
        }
        else led_flash(BRIGHT, BRIGHT, BRIGHT, 60);
    }
    else if (strncmp(w, "split=", 6) == 0) {               /* 0 Linked, 1 Separate */
        if (parse_nums(w + 6, n, 1, 1)) set_split((uint8_t)n[0]);
        else                            led_flash(BRIGHT, BRIGHT, BRIGHT, 60);
    }
    else if (strncmp(w, "hh=", 3) == 0) {                  /* both LEDs: H1/S1/V1/H2/S2/V2 */
        if (parse_hsv(w + 3, hv, 2)) { led_hsv_one(0, hv[0]); led_hsv_one(1, hv[1]); }
        else                         led_flash(BRIGHT, BRIGHT, BRIGHT, 60);
    }
    else if (strncmp(w, "pal=", 4) == 0) {                  /* 2.1.0: the ring, entry k = pixel k */
        hsv_t pal[RING_PIXELS];
        int   cnt = parse_palette(w + 4, pal);
        if (cnt) led_palette(pal, cnt);
        else     led_flash(BRIGHT, BRIGHT, BRIGHT, 60);
    }
    else if (strncmp(w, "p=", 2) == 0 && parse_nums(w + 2, n, 4, 360) && n[0] < RING_PIXELS &&
             n[2] <= 100 && n[3] <= 100) {                 /* 2.1.0: p=I/H/S/V, one pixel */
        hsv_t c = { (int16_t)((n[1] % 360u) * HUE_MAX / 360u), pct(n[2]), pct(n[3]) };
        led_pixel((uint8_t)n[0], c);
    }
    else if ((w[0] == 'h' || w[0] == 'l') && (w[1] == '1' || w[1] == '2') && w[2] == '=') {
        uint8_t i = (uint8_t)(w[1] - '1');                 /* h1= h2= l1= l2=: one LED */
        if (w[0] == 'h' && parse_hsv(w + 3, hv, 1)) led_hsv_one(i, hv[0]);
        else if (w[0] == 'l' && parse_rgb(w + 3, rgb)) led_colour_one(i, rgb);
        else                                           led_flash(BRIGHT, BRIGHT, BRIGHT, 60);
    }
    else if (strstr(w, "off")) {
        led_colour(0, 0, 0);
    }
    else if (strncmp(w, "candle=", 7) == 0 && parse_nums(w + 7, n, 4, 100) && n[2] <= 60 && n[3] <= 1) {
        cd_hue   = (int16_t)(n[2] * HUE_MAX / 360);         /* V/M/H/S: S is accepted, every flame is individual */
        led_candle(pct(n[0]), n[1] != 0);
    }
    else if (strncmp(w, "candle=", 7) == 0 && parse_nums(w + 7, n, 3, 100) && n[2] <= 60) {
        cd_hue   = (int16_t)(n[2] * HUE_MAX / 360);
        led_candle(pct(n[0]), n[1] != 0);
    }
    else if (strncmp(w, "candle=", 7) == 0 && parse_nums(w + 7, n, 2, 100)) {
        cd_hue   = CANDLE_HUE;
        led_candle(pct(n[0]), n[1] != 0);
    }
    else if (strncmp(w, "candle=", 7) == 0 && parse_nums(w + 7, n, 1, 100)) {
        led_candle(pct(n[0]), 0);
    }
    else if (strncmp(w, "breathe", 7) == 0) {
        const char *eq = strchr(w, '=');
        if (eq && parse_nums(eq + 1, n, 1, 100)) led_fx(pct(n[0]));
        else if (!eq)                            led_fx(last_v);
        else                                     led_flash(BRIGHT, BRIGHT, BRIGHT, 60);
    }
    else if (strcmp(w, "candle") == 0) {
        led_candle(last_v, 0);
    }
    else if (strncmp(w, "spin=", 5) == 0 && spin_parse(w + 5, n, &falloff, &front, &length, &strength)) {
        hsv_t c = { (int16_t)((n[0] % 360u) * HUE_MAX / 360u), pct(n[1]), pct(n[2]) };   /* H/S/V/T[/F[/W[/L[/P]]]] */
        led_spin(c, n[3], falloff, front, length, strength);
    }
    else if (strncmp(w, "fade=", 5) == 0 && parse_nums(w + 5, n, 1, 5000)) {
        fade_ms = n[0];
    }
    else if (strncmp(w, "decay=", 6) == 0 && parse_nums(w + 6, n, 1, 5000)) {   /* 2.1.17 */
        decay_ms = n[0];
        if (!decay_ms) for (int i = 0; i < RING_PIXELS; i++) { L[i].decay_at = 0; L[i].trail_ms = 0; }   /* pixels hold */
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
    else if (strncmp(w, "h=", 2) == 0 && parse_hsv(w + 2, hv, 1)) {
        led_hsv(hv[0]);
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
    leds_init();
    usart_init(saved_baud());

    led_colour(BRIGHT, 0, 0);                  /* boot: red, proves the LED works */
#if WS_USE_DMA
    if (!ws_ok) led_flash(BRIGHT, BRIGHT, 0, 1000);   /* yellow: DMA driver failed */
#endif

    uint32_t last_rx = 0;

    while (1) {
        tx_poll();
        led_poll();
        alert_poll();

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

        if (rxq_head == rxq_tail)          /* the IRQ queues bytes; this loop only drains */
            continue;

        uint8_t b = rxq[rxq_tail];
        rxq_tail = (uint16_t)((rxq_tail + 1) % RXQ_SIZE);
        last_rx  = rx_last;

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
