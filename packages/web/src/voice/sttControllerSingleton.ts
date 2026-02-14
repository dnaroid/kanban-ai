import { WebSpeechController } from "@web/voice/WebSpeechController";

let controller: WebSpeechController | null = null;

/**
 * Возвращает синглтон Web Speech API контроллера.
 * Web Speech API не требует моделей - работает через браузер.
 */
export function getSTTController(): WebSpeechController {
 if (!controller) {
  controller = new WebSpeechController();
 }

 return controller;
}

// Тип для обратной совместимости
export type STTController = WebSpeechController;
