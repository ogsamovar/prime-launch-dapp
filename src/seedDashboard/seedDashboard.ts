import { autoinject } from "aurelia-framework";
import { SeedService } from "services/SeedService";
import { bindable } from "aurelia-typed-observable-plugin";
import { Address } from "services/EthereumService";
import "./seedDashboard.scss";
import { Seed } from "entities/Seed";
import { Utils } from "services/utils";
import { EventConfigException } from "services/GeneralEvents";
import { EventAggregator } from "aurelia-event-aggregator";

@autoinject
export class SeedDashboard {
  @bindable address: Address;

  seed: Seed;
  loading = true;

  constructor(
    private eventAggregator: EventAggregator,
    private seedService: SeedService,
  ) {}


  async activate(params: { address: Address}): Promise<void> {
    this.address = params.address;
  }

  async attached(): Promise<void> {
    try {
      let waiting = false;
      if (this.seedService.initializing) {
        await Utils.sleep(200);
        this.eventAggregator.publish("seeds.loading", true);
        waiting = true;
        await this.seedService.ensureInitialized();
      }
      this.seed = this.seedService.seeds.get(this.address);
      if (this.seed.initializing) {
        if (!waiting) {
          await Utils.sleep(200);
          this.eventAggregator.publish("seeds.loading", true);
        }
        await this.seed.ensureInitialized();
      }
    } catch (ex) {
      this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an error occurred", ex));
    }
    finally {
      this.eventAggregator.publish("seeds.loading", false);
      this.loading = false;
    }
  }
}
