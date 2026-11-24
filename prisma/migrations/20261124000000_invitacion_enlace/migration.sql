-- Enlace de invitación propio: no depende de que llegue el correo de Supabase
ALTER TABLE "staff" ADD COLUMN "inviteToken" TEXT;
CREATE UNIQUE INDEX "staff_inviteToken_key" ON "staff"("inviteToken");
