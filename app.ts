'use strict';

import Homey from 'homey';
import { OhmeDevice } from './lib/OhmeDevice';

module.exports = class OhmeApp extends Homey.App {
  async onInit(): Promise<void> {
    this.log('Ohme app initialized');

    // Charger status trigger — fires when status changes, with optional filter
    const statusTrigger = this.homey.flow.getTriggerCard('charger_status_changed');
    statusTrigger.registerRunListener(async (args: { status: string }, state: { status: string }) => {
      return args.status === state.status;
    });

    // Charger status condition — check current status
    const statusCondition = this.homey.flow.getConditionCard('charger_status_is');
    statusCondition.registerRunListener(async (args: { device: OhmeDevice; status: string }) => {
      return args.device.getApi().status === args.status;
    });

    // Set target time
    const setTargetTimeAction = this.homey.flow.getActionCard('set_target_time');
    setTargetTimeAction.registerRunListener(async (args: { device: OhmeDevice; hour: number; minute: number }) => {
      await args.device.getApi().setTarget({ targetTime: [args.hour, args.minute] });
    });

    // Approve charge
    const approveChargeAction = this.homey.flow.getActionCard('approve_charge');
    approveChargeAction.registerRunListener(async (args: { device: OhmeDevice }) => {
      await args.device.getApi().approveCharge();
    });

    // Set price cap value
    const setPriceCapAction = this.homey.flow.getActionCard('set_price_cap_value');
    setPriceCapAction.registerRunListener(async (args: { device: OhmeDevice; price: number }) => {
      await args.device.getApi().setPriceCapValue(args.price);
    });

    // Select vehicle
    const selectVehicleAction = this.homey.flow.getActionCard('select_vehicle');
    selectVehicleAction.registerRunListener(async (args: { device: OhmeDevice; vehicle: { id: string } }) => {
      await args.device.getApi().selectVehicle(args.vehicle.id);
    });

    selectVehicleAction.registerArgumentAutocompleteListener('vehicle', async (_query: string, args: { device: OhmeDevice }) => {
      const vehicles = args.device.getApi().vehicles;
      return vehicles.map((v) => ({
        name: v.name || `${v.model?.brand?.name ?? v.model?.make ?? ''} ${v.model?.modelName ?? ''}`.trim(),
        id: v.id,
      }));
    });
  }
};
