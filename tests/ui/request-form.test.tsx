import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDS, buildSeed } from '@/data/seed';
import { useApp } from '@/data/store';
import { RequestFormDialog } from '@/features/requests/RequestForm';

describe('formulario de solicitud de compra (validación progresiva)', () => {
  beforeEach(() => {
    useApp.setState({ db: buildSeed(), userId: IDS.userDiego, toasts: [] });
  });

  it('no publica con datos inválidos, lleva a la sección con error y publica al corregir', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const before = useApp.getState().db.requests.length;
    render(<RequestFormDialog open onOpenChange={onOpenChange} />);
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Publicar solicitud' }));
    // Primera sección con error: volumen. La cantidad vacía no se acepta.
    expect(await within(dialog).findByText(/Cantidad: ingresar un número válido/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Cantidad mínima/)).toHaveAttribute('aria-invalid', 'true');
    expect(useApp.getState().db.requests).toHaveLength(before);

    await user.type(within(dialog).getByLabelText(/Cantidad mínima/), '0');
    expect(within(dialog).getByText('Cantidad: debe ser mayor a cero')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText(/Cantidad mínima/));
    await user.type(within(dialog).getByLabelText(/Cantidad mínima/), '40');
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Publicar solicitud' }));
    // Sigue faltando el destino: el formulario salta a esa sección.
    expect(await within(dialog).findByText('País de destino: requerido')).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText(/País de destino/), 'PE');

    await user.click(within(dialog).getByRole('button', { name: 'Publicar solicitud' }));
    const requests = useApp.getState().db.requests;
    expect(requests).toHaveLength(before + 1);
    const created = requests.at(-1)!;
    expect(created).toMatchObject({ status: 'published', quantityT: '40', destinationCountry: 'PE', buyerOrganizationId: IDS.orgAndes });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('exige la variedad cuando el comprador no admite equivalentes', async () => {
    const user = userEvent.setup();
    render(<RequestFormDialog open onOpenChange={() => {}} initial={{ quantityT: '25', destinationCountry: 'PE', varietyPolicy: 'exact' }} />);
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Publicar solicitud' }));
    expect(await within(dialog).findByText('Indicar la variedad exigida o admitir equivalentes')).toBeInTheDocument();
  });
});
