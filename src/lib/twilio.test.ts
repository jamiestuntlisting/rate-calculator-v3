import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  twilioSignedPayload,
  twilioSignature,
  validateTwilioSignature,
  twimlMessage,
} from "@/lib/twilio";
import { phoneDigits, phoneKey, isPlausiblePhone } from "@/lib/phone";

/**
 * The signature scheme is Twilio's documented one: HMAC-SHA1 over the
 * called URL plus every POST param sorted by name and concatenated as
 * name+value, base64. Pinned against node's own HMAC so the WebCrypto
 * implementation can never quietly drift from the algorithm.
 */

const TOKEN = "12345678901234567890123456789012";
const URL_CALLED = "https://rate-calculator.jamie-181.workers.dev/api/inbound-sms";
const PARAMS = {
  To: "+15551234567",
  From: "+19293250311",
  NumMedia: "1",
  MediaUrl0: "https://api.twilio.com/media/ME123",
  Body: "Exhibit G attached",
};

describe("twilio signature", () => {
  it("orders params by name after the url", () => {
    expect(twilioSignedPayload(URL_CALLED, PARAMS)).toBe(
      URL_CALLED +
        "BodyExhibit G attached" +
        "From+19293250311" +
        "MediaUrl0https://api.twilio.com/media/ME123" +
        "NumMedia1" +
        "To+15551234567"
    );
  });

  it("matches node's HMAC-SHA1 to the byte", async () => {
    const expected = createHmac("sha1", TOKEN)
      .update(twilioSignedPayload(URL_CALLED, PARAMS))
      .digest("base64");
    expect(await twilioSignature(TOKEN, URL_CALLED, PARAMS)).toBe(expected);
    expect(
      await validateTwilioSignature(TOKEN, URL_CALLED, PARAMS, expected)
    ).toBe(true);
  });

  it("refuses a wrong signature, a wrong token and a wrong url", async () => {
    const good = await twilioSignature(TOKEN, URL_CALLED, PARAMS);
    expect(
      await validateTwilioSignature(TOKEN, URL_CALLED, PARAMS, good.slice(0, -2) + "xx")
    ).toBe(false);
    expect(
      await validateTwilioSignature("wrong-token", URL_CALLED, PARAMS, good)
    ).toBe(false);
    expect(
      await validateTwilioSignature(TOKEN, URL_CALLED + "?x=1", PARAMS, good)
    ).toBe(false);
  });

  it("escapes the TwiML reply", () => {
    expect(twimlMessage("Got it — 2 < 3 & so on")).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Got it — 2 &lt; 3 &amp; so on</Message></Response>'
    );
  });
});

describe("phone matching", () => {
  it("reduces every format to the same key", () => {
    for (const raw of [
      "+1 (929) 325-0311",
      "929.325.0311",
      "19293250311",
      "+19293250311",
      "929 325 0311",
    ]) {
      expect(phoneKey(raw)).toBe("9293250311");
    }
  });

  it("keeps stored digits and judges plausibility", () => {
    expect(phoneDigits("+1 (929) 325-0311")).toBe("19293250311");
    expect(isPlausiblePhone("929-325-0311")).toBe(true);
    expect(isPlausiblePhone("911")).toBe(false);
    expect(phoneKey("911")).toBe("911");
  });
});
