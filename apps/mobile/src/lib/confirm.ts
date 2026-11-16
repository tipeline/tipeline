import { alertController } from '@ionic/vue';

/** The phone's own confirm dialog. Resolves true when the person confirms. */
export async function confirmAction(options: {
  header: string;
  message: string;
  confirm: string;
  cancel: string;
  destructive?: boolean;
}): Promise<boolean> {
  const alert = await alertController.create({
    header: options.header,
    message: options.message,
    buttons: [
      { text: options.cancel, role: 'cancel' },
      { text: options.confirm, role: options.destructive ? 'destructive' : 'confirm' },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  return role === 'destructive' || role === 'confirm';
}
