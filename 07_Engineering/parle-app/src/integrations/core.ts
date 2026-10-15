import { parleClient } from "@/lib/backend";

export const uploadFile = parleClient.integrations.core.uploadFile;
const notAvailable = (name: string) => async (..._args: unknown[]): Promise<never> => {
  throw new Error(`${name} is not available outside Buildy (backend Plan 3 replaces it)`);
};
export const invokeLLM = notAvailable("invokeLLM");
export const sendEmail = notAvailable("sendEmail");
export const getUploadedFile = notAvailable("getUploadedFile");
export const generateImage = notAvailable("generateImage");
export const editImage = notAvailable("editImage");
export const extractDataFromUploadedFile = notAvailable("extractDataFromUploadedFile");
export const core = { uploadFile, invokeLLM, sendEmail, getUploadedFile, generateImage, editImage, extractDataFromUploadedFile };
