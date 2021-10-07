import { LbpManager } from "entities/LbpManager";
import { autoinject, computedFrom } from "aurelia-framework";
import { Address } from "services/EthereumService";
import { TokenService } from "services/TokenService";
import { AureliaHelperService } from "services/AureliaHelperService";
import { EthereumService, Networks } from "services/EthereumService";
import TransactionsService from "services/TransactionsService";
import { IpfsService } from "./IpfsService";
import { ConsoleLogService } from "./ConsoleLogService";
import { Container } from "aurelia-dependency-injection";
import { EventAggregator } from "aurelia-event-aggregator";
import { ContractNames, ContractsService, IStandardEvent } from "services/ContractsService";
import { EventConfigException } from "services/GeneralEvents";

export interface ILBPManagerDeployedEventArgs {
  lbpManager: Address;
  admin: Address;
  metadata: string;
}

@autoinject
export class LbpManagerService {

  public lbpMgrs: Map<Address, LbpManager>;
  public static lbpFee = 0.0; // If the value is ever > 0, then should be a fraction like 0.1 to represent 1%

  @computedFrom("lbps.size")
  public get lbpsArray(): Array<LbpManager> {
    return this.lbpMgrs ? Array.from(this.lbpMgrs.values()) : [];
  }

  public initializing = true;

  private lbpManagerFactory: any;
  private initializedPromise: Promise<void>;
  /**
   * when the factory was created, pulled by hand from etherscan.io
   */
  private startingBlockNumber: number;

  constructor(
    private contractsService: ContractsService,
    private eventAggregator: EventAggregator,
    private container: Container,
    private consoleLogService: ConsoleLogService,
    private transactionsService: TransactionsService,
    private ethereumService: EthereumService,
    private ipfsService: IpfsService,
    private aureliaHelperService: AureliaHelperService,
    private tokenService: TokenService,
  ) {
    /**
     * otherwise singleton is the default
     */
    this.container.registerTransient(LbpManager);

    this.eventAggregator.subscribe("Lbp.InitializationFailed", async (lbpAddress: string) => {
      this.lbpMgrs.delete(lbpAddress);
    });

    this.startingBlockNumber = (this.ethereumService.targetedNetwork === Networks.Mainnet) ?
      13372668 : 9423409;
  }


  public async initialize(): Promise<void> {
    // disabled for now
    // if (!this.featuredSeedsJson) {
    //   // eslint-disable-next-line require-atomic-updates
    //   if (process.env.NODE_ENV === "development") {
    //     this.featuredSeedsJson = require("../configurations/featuredSeeds.json");
    //   } else {
    //     axios.get("https://raw.githubusercontent.com/PrimeDAO/prime-launch-dapp/master/src/configurations/featuredSeeds.json")
    //       .then((response) => this.featuredSeedsJson = response.data);
    //   }
    // }

    /**
     * don't need to reload the seedfactory on account change because we never send txts to it.
     */
    this.lbpManagerFactory = await this.contractsService.getContractFor(ContractNames.LBPMANAGERFACTORY);
    /**
     * seeds will take care of themselves on account changes
     */
    return this.getLbps();
  }

  public ensureInitialized(): Promise<void> {
    return this.initializedPromise;
  }

  public async ensureAllLbpsInitialized(): Promise<void> {
    await this.ensureInitialized();
    for (const lbp of this.lbpsArray) {
      await lbp.ensureInitialized();
    }
  }

  private async getLbps(): Promise<void> {
    return this.initializedPromise = new Promise(
      (resolve: (value: void | PromiseLike<void>) => void,
        reject: (reason?: any) => void): void => {
        if (!this.lbpMgrs?.size) {
          try {
            const lbpMgrsMap = new Map<Address, LbpManager>();
            const filter = this.lbpManagerFactory.filters.LBPManagerDeployed();
            this.lbpManagerFactory.queryFilter(filter, this.startingBlockNumber)
              .then(async (txEvents: Array<IStandardEvent<ILBPManagerDeployedEventArgs>>) => {
                for (const event of txEvents) {
                  const lbpMgr = this.createLbpManagerFromConfig(event);
                  lbpMgrsMap.set(lbpMgr.address, lbpMgr);
                  /**
                   * remove the seed if it is corrupt
                   */
                  this.aureliaHelperService.createPropertyWatch(lbpMgr, "corrupt", (newValue: boolean) => {
                    if (newValue) { // pretty much the only case
                      this.lbpMgrs.delete(lbpMgr.address);
                    }
                  });
                  this.consoleLogService.logMessage(`loaded LBP: ${lbpMgr.address}`, "info");
                  lbpMgr.initialize(); // set this off asyncronously.
                }
                this.lbpMgrs = lbpMgrsMap;
                this.initializing = false;
                resolve();
              });
          }
          catch (error) {
            this.lbpMgrs = new Map();
            this.eventAggregator.publish("handleException", new EventConfigException("Sorry, an error occurred", error));
            this.initializing = false;
            reject();
          }
        }
      },
    );
  }

  private createLbpManagerFromConfig(config: IStandardEvent<ILBPManagerDeployedEventArgs>): LbpManager {
    const lbpMgr = this.container.get(LbpManager);
    return lbpMgr.create({ admin: config.args.admin, address: config.args.lbpManager, metadata: config.args.metadata });
    return null;
  }

}